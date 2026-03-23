import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UserEntity } from './entities/user.entity';
import { LongLivedTokenEntity } from './entities/long-lived-token.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { ConfigService } from '@nestjs/config';

const BCRYPT_ROUNDS = 12;

export interface CreateUserDto {
  username: string;
  password: string;
  display_name?: string;
  is_admin?: boolean;
}

export interface CreateLltDto {
  name: string;
  expires_in_days?: number;
}

export interface LltResponse {
  id: string;
  name: string;
  created_at: Date;
  expires_at: string | null;
  last_used_at: string | null;
}

/**
 * Authentication service implementing HA's auth model:
 * - Short-lived JWT (30 min) for normal sessions
 * - Long-lived access tokens (up to 10 years) for integrations/scripts
 * - bcrypt password hashing
 * - SHA-256 token hashing (never store plaintext LLTs)
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(LongLivedTokenEntity)
    private readonly lltRepo: Repository<LongLivedTokenEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultAdmin();
  }

  /**
   * Validate username/password credentials.
   * Returns the user if valid, null otherwise.
   */
  async validateUser(
    username: string,
    password: string,
  ): Promise<UserEntity | null> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user || !user.is_active) return null;

    const isValid = await bcrypt.compare(password, user.password_hash);
    return isValid ? user : null;
  }

  /**
   * Issue a short-lived JWT for an authenticated user.
   */
  async login(user: UserEntity): Promise<{ access_token: string; token_type: string }> {
    const payload = {
      sub: user.id,
      token_type: 'normal',
    };

    return {
      access_token: this.jwtService.sign(payload),
      token_type: 'Bearer',
    };
  }

  /**
   * Validate a JWT or long-lived token and return the associated user.
   * Used by JWT strategy for REST + WebSocket authentication.
   */
  async validateToken(token: string): Promise<UserEntity | null> {
    // Try JWT first
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      const user = await this.userRepo.findOne({ where: { id: payload.sub, is_active: true } });
      return user ?? null;
    } catch {
      // Not a valid JWT, try as long-lived token
    }

    // Try long-lived token (SHA-256 hash lookup)
    const tokenHash = this.hashToken(token);
    const llt = await this.lltRepo.findOne({
      where: { token_hash: tokenHash },
      relations: ['user'],
    });

    if (!llt || !llt.user.is_active) return null;

    // Check expiry
    if (llt.expires_at && new Date(llt.expires_at) < new Date()) {
      return null;
    }

    // Update last_used_at asynchronously
    this.lltRepo
      .update({ id: llt.id }, { last_used_at: new Date().toISOString() })
      .catch(() => {});

    return llt.user;
  }

  /**
   * Create a new user.
   */
  async createUser(dto: CreateUserDto): Promise<UserEntity> {
    const existing = await this.userRepo.findOne({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException(`User '${dto.username}' already exists`);
    }

    const password_hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({
      username: dto.username,
      password_hash,
      display_name: dto.display_name ?? dto.username,
      is_admin: dto.is_admin ?? false,
    });

    return this.userRepo.save(user);
  }

  /**
   * Create a long-lived access token for a user.
   * Returns the plaintext token ONCE - it cannot be retrieved again.
   */
  async createLongLivedToken(
    userId: string,
    dto: CreateLltDto,
  ): Promise<{ token: string; entry: LltResponse }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate a cryptographically random token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);

    let expiresAt: string | null = null;
    if (dto.expires_in_days) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + dto.expires_in_days);
      expiresAt = expiry.toISOString();
    }

    const llt = this.lltRepo.create({
      user_id: userId,
      name: dto.name,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    const saved = await this.lltRepo.save(llt);

    this.logger.log(
      `Long-lived token created for user ${user.username}: ${dto.name}`,
    );

    return {
      token,
      entry: {
        id: saved.id,
        name: saved.name,
        created_at: saved.created_at,
        expires_at: saved.expires_at,
        last_used_at: saved.last_used_at,
      },
    };
  }

  /**
   * List all long-lived tokens for a user (without the actual tokens).
   */
  async listLongLivedTokens(userId: string): Promise<LltResponse[]> {
    const tokens = await this.lltRepo.find({ where: { user_id: userId } });
    return tokens.map((t) => ({
      id: t.id,
      name: t.name,
      created_at: t.created_at,
      expires_at: t.expires_at,
      last_used_at: t.last_used_at,
    }));
  }

  /**
   * Revoke a long-lived token.
   */
  async revokeLongLivedToken(userId: string, tokenId: string): Promise<void> {
    const token = await this.lltRepo.findOne({
      where: { id: tokenId, user_id: userId },
    });
    if (!token) {
      throw new NotFoundException('Token not found');
    }
    await this.lltRepo.delete({ id: tokenId });
  }

  async findUserById(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  /**
   * Get payload from JWT (without validation for internal use).
   */
  decodeToken(token: string): JwtPayload | null {
    try {
      return this.jwtService.decode(token) as JwtPayload;
    } catch {
      return null;
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Ensure a default admin user exists on first startup.
   */
  private async ensureDefaultAdmin(): Promise<void> {
    const count = await this.userRepo.count();
    if (count > 0) return;

    this.logger.warn(
      '='.repeat(60) + '\n' +
      'Creating default admin user: admin / admin\n' +
      'CHANGE THIS PASSWORD IMMEDIATELY!\n' +
      '='.repeat(60),
    );

    await this.createUser({
      username: 'admin',
      password: 'admin',
      display_name: 'Administrator',
      is_admin: true,
    });
  }
}

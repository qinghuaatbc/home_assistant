import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UserEntity } from './entities/user.entity';
import { LongLivedTokenEntity } from './entities/long-lived-token.entity';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: any;

  const mockUserRepo = {
    count: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn().mockImplementation((d) => d),
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockTokenRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn().mockImplementation((d) => d),
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'auth.jwt_secret') return 'test-secret';
      if (key === 'auth.jwt_expiry') return '30m';
      return null;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: mockUserRepo },
        { provide: getRepositoryToken(LongLivedTokenEntity), useValue: mockTokenRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('seedDefaultUser', () => {
    it('should create default admin user if none exists', async () => {
      mockUserRepo.count.mockResolvedValue(0);
      mockUserRepo.save.mockResolvedValue({ id: 1, username: 'admin' });

      await service.onModuleInit();

      expect(mockUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'admin', is_admin: true }),
      );
    });

    it('should not create default user if one already exists', async () => {
      mockUserRepo.count.mockResolvedValue(1);

      await service.onModuleInit();

      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('validateUser', () => {
    it('should return user for valid credentials', async () => {
      const hashed = await bcrypt.hash('admin', 12);
      mockUserRepo.findOne.mockResolvedValue({ id: 1, username: 'admin', password_hash: hashed, is_active: true });

      const result = await service.validateUser('admin', 'admin');
      expect(result).toBeDefined();
      expect(result!.username).toBe('admin');
    });

    it('should return null for invalid password', async () => {
      const hashed = await bcrypt.hash('admin', 12);
      mockUserRepo.findOne.mockResolvedValue({ id: 1, username: 'admin', password_hash: hashed, is_active: true });

      const result = await service.validateUser('admin', 'wrong-password');
      expect(result).toBeNull();
    });

    it('should return null for unknown user', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const result = await service.validateUser('unknown', 'pass');
      expect(result).toBeNull();
    });
  });



  describe('login', () => {
    it('should return access token for valid user', async () => {
      const result = await service.login({ id: 1, username: 'admin', is_admin: true } as unknown as UserEntity);
      expect(result.access_token).toBe('mock-jwt-token');
      expect(mockJwtService.sign).toHaveBeenCalled();
    });
  });
});

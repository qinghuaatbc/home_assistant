import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AuthService, CreateLltDto } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserEntity } from './entities/user.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Login with username/password to get a short-lived JWT.
   * POST /auth/login
   */
  @Post('login')
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with username/password' })
  @ApiBody({
    schema: {
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
      },
    },
  })
  async login(@Request() req: { user: UserEntity }) {
    return this.authService.login(req.user);
  }

  /**
   * OAuth2 token endpoint (password grant).
   * POST /auth/token
   */
  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OAuth2 password grant' })
  async token(
    @Body() body: { username: string; password: string; grant_type: string },
  ) {
    if (body.grant_type !== 'password') {
      return { error: 'unsupported_grant_type' };
    }

    const user = await this.authService.validateUser(
      body.username,
      body.password,
    );
    if (!user) {
      return { error: 'invalid_grant', error_description: 'Invalid credentials' };
    }

    const result = await this.authService.login(user);
    return {
      access_token: result.access_token,
      token_type: 'Bearer',
      expires_in: 1800,
    };
  }

  /**
   * List user's long-lived tokens.
   * GET /auth/long_lived_tokens
   */
  @Get('long_lived_tokens')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List long-lived access tokens' })
  async listLongLivedTokens(@CurrentUser() user: UserEntity) {
    return this.authService.listLongLivedTokens(user.id);
  }

  /**
   * Create a new long-lived token.
   * POST /auth/long_lived_tokens
   */
  @Post('long_lived_tokens')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a long-lived access token' })
  async createLongLivedToken(
    @CurrentUser() user: UserEntity,
    @Body() dto: CreateLltDto,
  ) {
    const { token, entry } = await this.authService.createLongLivedToken(
      user.id,
      dto,
    );

    return {
      ...entry,
      // Token is returned ONCE and cannot be retrieved again
      token,
    };
  }

  /**
   * Revoke a long-lived token.
   * DELETE /auth/long_lived_tokens/:id
   */
  @Delete('long_lived_tokens/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a long-lived access token' })
  async revokeLongLivedToken(
    @CurrentUser() user: UserEntity,
    @Param('id') tokenId: string,
  ) {
    await this.authService.revokeLongLivedToken(user.id, tokenId);
  }
}

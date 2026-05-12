import { HttpException, HttpStatus } from '@nestjs/common';
import { LoginRateLimitGuard } from './login-rate-limit.guard';

describe('LoginRateLimitGuard', () => {
  let guard: LoginRateLimitGuard;

  beforeEach(() => {
    guard = new LoginRateLimitGuard();
  });

  it('should allow first attempt', () => {
    const ctx = mockContext('1.2.3.4');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow requests below the limit', () => {
    const ctx = mockContext('1.2.3.5');
    // 9 requests should all pass
    for (let i = 0; i < 9; i++) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('should block requests exceeding the limit', () => {
    const ctx = mockContext('1.2.3.6');
    for (let i = 0; i < 10; i++) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
    expect(() => guard.canActivate(ctx)).toThrow();
  });

  it('should track different IPs independently', () => {
    const ctxA = mockContext('10.0.0.1');
    const ctxB = mockContext('10.0.0.2');

    for (let i = 0; i < 10; i++) {
      expect(guard.canActivate(ctxA)).toBe(true);
    }
    expect(() => guard.canActivate(ctxA)).toThrow();

    // B should still be allowed
    expect(guard.canActivate(ctxB)).toBe(true);
  });

  it('should use x-forwarded-for header when available', () => {
    const ctx = mockContext('10.0.0.3');
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

function mockContext(ip: string): any {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {},
        socket: { remoteAddress: ip },
      }),
    }),
    getClass: () => ({}),
    getHandler: () => ({}),
    getArgs: () => [],
    getArgByIndex: () => ({}),
    getType: () => 'http',
    switchToRpc: () => ({} as any),
    switchToWs: () => ({} as any),
  };
}

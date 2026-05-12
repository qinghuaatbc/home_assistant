import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard();
  });

  it('should allow admin user', () => {
    const context = mockContext({ is_admin: true });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny non-admin user', () => {
    const context = mockContext({ is_admin: false });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should deny user with no is_admin flag', () => {
    const context = mockContext({});
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should deny when user is undefined', () => {
    const context = mockContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

function mockContext(user: any): any {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  };
}

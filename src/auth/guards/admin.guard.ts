import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CanActivate } from '@nestjs/common';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as UserEntity | undefined;
    if (!user?.is_admin) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}

import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { StateContext } from './ha-context.interface';

/**
 * Generates Context objects for tracking the origin of events and actions.
 */
@Injectable()
export class ContextService {
  /**
   * Create a new root context (no parent, optional user).
   */
  create(userId: string | null = null): StateContext {
    return {
      id: uuidv4(),
      parent_id: null,
      user_id: userId,
    };
  }

  /**
   * Create a child context linked to a parent context.
   */
  createChild(parentContext: StateContext): StateContext {
    return {
      id: uuidv4(),
      parent_id: parentContext.id,
      user_id: parentContext.user_id,
    };
  }

  /**
   * System context (no user, no parent) - used for internal system actions.
   */
  system(): StateContext {
    return {
      id: uuidv4(),
      parent_id: null,
      user_id: null,
    };
  }
}

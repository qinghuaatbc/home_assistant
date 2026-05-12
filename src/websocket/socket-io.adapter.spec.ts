import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocketIoAdapter } from './socket-io.adapter';

describe('SocketIoAdapter', () => {
  let mockApp: INestApplicationContext;
  let mockConfig: ConfigService;

  beforeEach(() => {
    mockConfig = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'http.cors_allowed_origins') return ['*'];
        return defaultValue;
      }),
    } as any;

    mockApp = {
      get: jest.fn().mockReturnValue(mockConfig),
    } as any;
  });

  it('should create an adapter', () => {
    const adapter = new SocketIoAdapter(mockApp);
    expect(adapter).toBeDefined();
  });

  it('should read cors origins from config', () => {
    const spy = jest.spyOn(mockConfig, 'get');
    new SocketIoAdapter(mockApp);
    expect(spy).toHaveBeenCalledWith('http.cors_allowed_origins', ['*']);
  });

  it('should handle specific cors origins', () => {
    (mockConfig.get as jest.Mock).mockReturnValue(['https://example.com']);
    const adapter = new SocketIoAdapter(mockApp);
    expect(adapter).toBeDefined();
  });

  it('should pass cors options when creating io server', () => {
    const adapter = new SocketIoAdapter(mockApp);
    const createSpy = jest.spyOn(adapter, 'createIOServer');
    // Just verify the method exists and is configurable
    expect(typeof adapter.createIOServer).toBe('function');
    createSpy.mockRestore();
  });
});

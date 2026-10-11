import { Test } from '@nestjs/testing';
import { Request } from 'express';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { PromptEnhancerController } from './prompt-enhancer.controller';
import { PromptEnhancerService } from './prompt-enhancer.service';

describe('PromptEnhancerController', () => {
  const request = { headers: { cookie: 'session=test' } } as Request;
  const service = {
    enhance: jest.fn().mockResolvedValue({ originalPrompt: '龙纹' }),
  };
  const auth = {
    getSessionTokenFromCookieHeader: jest.fn().mockReturnValue('test'),
    getUserBySessionToken: jest.fn(),
  };
  beforeEach(() => jest.clearAllMocks());
  it('rejects unauthenticated requests before invoking the paid model', async () => {
    auth.getUserBySessionToken.mockResolvedValue(null);
    const controller = new PromptEnhancerController(
      service as unknown as PromptEnhancerService,
      auth as unknown as AuthService,
    );
    await expect(
      controller.enhance(request, { prompt: '龙纹' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(service.enhance).not.toHaveBeenCalled();
  });
  it('delegates original input after authentication', async () => {
    auth.getUserBySessionToken.mockResolvedValue({ id: 'user-1' });
    const controller = new PromptEnhancerController(
      service as unknown as PromptEnhancerService,
      auth as unknown as AuthService,
    );
    const body = { prompt: '  龙纹  ', references: [] };
    await controller.enhance(request, body);
    expect(service.enhance).toHaveBeenCalledWith(body);
  });
  it('registers dedicated controller and service in AppModule', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    expect(module.get(PromptEnhancerController)).toBeInstanceOf(
      PromptEnhancerController,
    );
    expect(module.get(PromptEnhancerService)).toBeInstanceOf(
      PromptEnhancerService,
    );
    await module.close();
  });
});

import { WhatAgent } from '../WhatAgent.js';

describe('WhatAgent', () => {
  it('instantiates with required config', () => {
    const agent = new WhatAgent({
      accessToken: 'test-token',
      phoneNumberId: '123456789',
    });
    expect(agent).toBeInstanceOf(WhatAgent);
  });

  it('sendMessage returns error on HTTP failure', async () => {
    const agent = new WhatAgent({
      accessToken: 'bad-token',
      phoneNumberId: '123456789',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":{"message":"Invalid OAuth access token"}}',
    }) as jest.Mock;

    const result = await agent.sendMessage({ to: '+14155552671', text: 'Hello' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });

  it('sendMessage returns messageId on success', async () => {
    const agent = new WhatAgent({
      accessToken: 'valid-token',
      phoneNumberId: '123456789',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.test123' }] }),
    }) as jest.Mock;

    const result = await agent.sendMessage({ to: '+14155552671', text: 'Hello' });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('wamid.test123');
  });
});

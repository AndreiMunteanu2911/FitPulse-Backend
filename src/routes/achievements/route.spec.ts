import { getSupabaseAdminClient } from '../../helper/supabaseAdmin';
import { createSupabaseServerClient } from '../../helper/supabaseServer';
import { POST } from './route';

jest.mock('../../helper/supabaseServer', () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock('../../helper/supabaseAdmin', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

function workoutsQuery() {
  const result = {
    data: [{ workout_date: '2026-06-19', workout_exercises: [] }],
    error: null,
  };
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    then: jest.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject)),
  };
  return query;
}

describe('POST /api/achievements', () => {
  it('uses the service-only claim function without accepting an XP reward', async () => {
    const query = workoutsQuery();
    jest.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from: jest.fn(() => query),
    } as never);

    const rpc = jest.fn().mockResolvedValue({
      data: [{
        total_xp: 50,
        level: 2,
        claimed_at: '2026-06-19T00:00:00.000Z',
        xp_earned: 50,
      }],
      error: null,
    });
    jest.mocked(getSupabaseAdminClient).mockReturnValue({ rpc } as never);

    const response = await POST(new Request('http://localhost/api/achievements', {
      method: 'POST',
      body: JSON.stringify({ achievementId: 'first_workout', xpReward: 999999 }),
    }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('claim_achievement_for_user', {
      p_user_id: 'user-1',
      p_achievement_id: 'first_workout',
    });
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      xpEarned: 50,
      totalXP: 50,
    }));
  });
});

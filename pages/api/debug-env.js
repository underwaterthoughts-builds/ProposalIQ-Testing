import { requireAuth } from '../../lib/auth';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  // Show which env vars are present (never show the actual values)
  const vars = {
    OPENAI_API_KEY: {
      present: !!process.env.OPENAI_API_KEY,
      length: process.env.OPENAI_API_KEY?.length || 0,
      prefix: process.env.OPENAI_API_KEY?.slice(0, 7) || 'not set',
      has_spaces: process.env.OPENAI_API_KEY?.includes(' ') || false,
      has_newline: process.env.OPENAI_API_KEY?.includes('\n') || false,
    },
    GEMINI_API_KEY: {
      present: !!process.env.GEMINI_API_KEY,
      length: process.env.GEMINI_API_KEY?.length || 0,
      prefix: process.env.GEMINI_API_KEY?.slice(0, 7) || 'not set',
    },
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'not set (will use default)',
    NODE_ENV: process.env.NODE_ENV || 'not set',
    JWT_SECRET: process.env.JWT_SECRET ? `set (${process.env.JWT_SECRET.length} chars)` : 'not set',
  };

  return res.status(200).json(vars);
}

export default requireAuth(handler);

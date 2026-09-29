import { Router } from 'express';
import crypto from 'node:crypto';
import { getSetting, setSetting } from '../db.js';

export const authRouter = Router();

const COOKIE = 'bt_token';
const SALT = 'bank-tool-v1:';
const SESSION_MS = 30 * 86400 * 1000;

// token -> 过期时间戳（内存会话，服务重启后需重新登录）
const sessions = new Map();

function hash(pw) {
  return crypto.createHash('sha256').update(SALT + pw).digest('hex');
}
function hasPassword() {
  return Boolean(getSetting('access_password', ''));
}
function getCookie(req) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '');
  return m ? m[1] : null;
}
function isAuthed(req) {
  const token = getCookie(req);
  if (token && sessions.get(token) > Date.now()) {
    sessions.set(token, Date.now() + SESSION_MS); // 滑动续期
    return true;
  }
  return false;
}
function issueSession(res) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`);
}

authRouter.get('/status', (req, res) => {
  res.json({ authed: isAuthed(req), has_password: hasPassword() });
});

// 首次设置密码（仅在从未设置过时可用）
authRouter.post('/setup', (req, res) => {
  if (hasPassword()) return res.status(403).json({ error: '访问密码已设置，请直接登录' });
  const pw = String(req.body?.password || '');
  if (pw.length < 4) return res.status(400).json({ error: '密码至少 4 位' });
  setSetting('access_password', hash(pw));
  issueSession(res);
  res.json({ ok: true });
});

authRouter.post('/login', (req, res) => {
  const pw = String(req.body?.password || '');
  if (!hasPassword() || hash(pw) !== getSetting('access_password')) {
    return res.status(401).json({ error: '密码不正确' });
  }
  issueSession(res);
  res.json({ ok: true });
});

authRouter.post('/change', (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: '请先登录' });
  const { old_password, new_password } = req.body || {};
  if (hash(String(old_password || '')) !== getSetting('access_password')) {
    return res.status(401).json({ error: '原密码不正确' });
  }
  if (String(new_password || '').length < 4) {
    return res.status(400).json({ error: '新密码至少 4 位' });
  }
  setSetting('access_password', hash(String(new_password)));
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  const token = getCookie(req);
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ ok: true });
});

// 鉴权中间件：保护 /api/* 与 /uploads/*
export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: '未登录或登录已过期' });
}

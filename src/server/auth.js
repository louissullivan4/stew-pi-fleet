'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Hashed password is computed once at startup
let _hashedPassword = null;

function getHashedPassword() {
  if (!_hashedPassword) {
    const plain = process.env.DASHBOARD_PASSWORD || 'changeme';
    _hashedPassword = bcrypt.hashSync(plain, 10);
  }
  return _hashedPassword;
}

function signToken(username) {
  return jwt.sign({ sub: username }, SECRET, { expiresIn: EXPIRES_IN });
}

async function verifyCredentials(username, password) {
  const expectedUser = process.env.DASHBOARD_USERNAME || 'admin';
  if (username !== expectedUser) return false;
  return bcrypt.compare(password, getHashedPassword());
}

/** Express middleware — validates JWT from Authorization: Bearer header or cookie. */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) return res.status(401).json({ error: 'Unauthorised' });

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Lightweight token verification for WebSocket upgrade requests.
 * Reads the token from the `token` query param.
 */
function verifyWsToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

module.exports = { signToken, verifyCredentials, requireAuth, verifyWsToken };

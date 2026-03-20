// Middleware para verificar que el usuario es administrador
// Se usa en rutas que requieren privilegios de admin

export function requireAdmin(req, res, next) {
  // req.user es establecido por verifyToken en auth.js
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Requiere permisos de administrador' });
  }

  next();
}

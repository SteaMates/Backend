export const requireCanPublish = (req, res, next) => {
  const status = req.user?.status;

  if (status === 'banned') {
    return res.status(403).json({
      error: 'Tu cuenta está baneada y no puede publicar contenido.',
      code: 'USER_BANNED',
    });
  }

  if (status === 'silenced') {
    return res.status(403).json({
      error: 'Tu cuenta está silenciada y no puede publicar ni comentar.',
      code: 'USER_SILENCED',
    });
  }

  next();
};

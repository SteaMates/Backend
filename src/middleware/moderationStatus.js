/**
 * Nombre del fichero: moderationStatus.js
 * Descripción: Función auxiliar de propósito general especializada en require can publish.
 * Contiene lógica específica para transformar datos, realizar cálculos o
 * conectar diferentes partes del sistema según los requisitos del módulo.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
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

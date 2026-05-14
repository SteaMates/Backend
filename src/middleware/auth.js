/**
 * Nombre del fichero: auth.js
 * Descripción: Fichero fuente de la aplicación SteaMates.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.SESSION_SECRET || 'steamates-secret-key';

/**
 * Función: verifyToken
 * Descripción: Función auxiliar de propósito general especializada en verify token. Contiene
 * lógica específica para transformar datos, realizar cálculos o conectar
 * diferentes partes del sistema según los requisitos del módulo.
 */
export const verifyToken = async (req, res, next) => {
  try {
    // Expected header: "Authorization: Bearer <token>"
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user still exists
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized. User not found.' });
    }
    
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
       return res.status(401).json({ error: 'Unauthorized. Token expired, please log in again.' });
    }
    return res.status(401).json({ error: 'Unauthorized. Invalid token.' });
  }
};

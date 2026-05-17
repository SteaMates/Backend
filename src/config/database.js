/**
 * Nombre del fichero: database.js
 * Descripción: Fichero fuente de la aplicación SteaMates.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import mongoose from 'mongoose';
import logger from './logger.js';

/**
 * Función: connectDB
 * Descripción: Función auxiliar de propósito general especializada en connect d b. Contiene
 * lógica específica para transformar datos, realizar cálculos o conectar
 * diferentes partes del sistema según los requisitos del módulo.
 */
export async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/steamates';
    await mongoose.connect(uri);
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
}

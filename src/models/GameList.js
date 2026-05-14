/**
 * Nombre del fichero: GameList.js
 * Descripción: Fichero fuente de la aplicación SteaMates.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import mongoose from 'mongoose';

const gameListSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  categories: [{
    type: String,
  }],
  coverImage: {
    type: String,
    // Provide a default image URL here if no image is uploaded
    default: 'default-list-cover.jpg', 
  },
  // To keep track of the games added to this list (e.g., Steam App IDs and names)
  games: [{
    appId: { type: Number, required: true },
    name: { type: String, required: true },
    imageUrl: { type: String }
  }],
  // The creator of the list
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Users who liked this list
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  // Users who disliked this list
  dislikes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

export default mongoose.model('GameList', gameListSchema);

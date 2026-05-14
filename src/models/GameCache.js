/**
 * Nombre del fichero: GameCache.js
 * Descripción: Fichero fuente de la aplicación SteaMates.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import mongoose from 'mongoose';

const gameCacheSchema = new mongoose.Schema({
    appId: {
        type: Number,
        required: true,
        unique: true,
        index: true,
    },
    name: {
        type: String,
        default: '',
    },
    genres: [{
        type: String,
    }],
    isFree: {
        type: Boolean,
        default: false,
    },
    price: {
        type: Number,
        default: 0,
    },
    headerImage: {
        type: String,
        default: '',
    },
    tags: [{
        type: String,
    }],
    tagsUpdated: {
        type: Date,
        default: null,
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
    },
});

// TTL: cache expires after 30 days
gameCacheSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model('GameCache', gameCacheSchema);

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
    lastUpdated: {
        type: Date,
        default: Date.now,
    },
});

// TTL: cache expires after 30 days
gameCacheSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model('GameCache', gameCacheSchema);

import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
    titleUz: {
        type: String,
        required: true
    },
    titleRu: {
        type: String,
        required: true
    },
    availablePeriod: {
        type: Number,
        required: true,
        comment: 'In days'
    },
    price: {
        type: Number,
        required: true
    }
}, {
    timestamps: true
});

export const Plan = mongoose.model('Plan', planSchema);
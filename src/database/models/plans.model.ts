import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    duration: {
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
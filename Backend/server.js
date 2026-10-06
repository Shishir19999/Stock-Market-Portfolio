import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config({ quiet: true });

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0'; // reachable from other devices on the LAN

mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/stocks').then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('Error connecting to MongoDB:', error);
});

createApp().listen(PORT, HOST, () => {
    console.log(`Server is running on ${HOST}:${PORT}`);
});

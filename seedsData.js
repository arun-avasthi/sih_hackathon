const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jalrakshak', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Import models
const Sensor = require('../models/Sensor');

const seedSensors = [
    {
        sensorId: 'sensor-1',
        name: 'Yamuna at ITO',
        location: { lat: 28.6280, lng: 77.2432 },
        readings: { ph: 4.2, turbidity: 45.2, temperature: 26.1, dissolvedOxygen: 2.8 },
        status: 'critical',
        isActive: true
    },
    {
        sensorId: 'sensor-2',
        name: 'Hauz Khas Lake',
        location: { lat: 28.5535, lng: 77.2073 },
        readings: { ph: 5.1, turbidity: 38.7, temperature: 24.8, dissolvedOxygen: 3.2 },
        status: 'critical',
        isActive: true
    },
    {
        sensorId: 'sensor-3',
        name: 'Raj Ghat',
        location: { lat: 28.6417, lng: 77.2493 },
        readings: { ph: 6.2, turbidity: 25.3, temperature: 25.2, dissolvedOxygen: 4.8 },
        status: 'moderate',
        isActive: true
    },
    {
        sensorId: 'sensor-4',
        name: 'India Gate Lawns',
        location: { lat: 28.6129, lng: 77.2295 },
        readings: { ph: 7.1, turbidity: 8.2, temperature: 23.9, dissolvedOxygen: 6.5 },
        status: 'healthy',
        isActive: true
    },
    {
        sensorId: 'sensor-5',
        name: 'Lodhi Gardens',
        location: { lat: 28.5918, lng: 77.2273 },
        readings: { ph: 7.4, turbidity: 6.8, temperature: 24.1, dissolvedOxygen: 7.2 },
        status: 'healthy',
        isActive: true
    }
    // Add more sensors as needed
];

async function seedDatabase() {
    try {
        console.log('Clearing existing data...');
        await Sensor.deleteMany({});

        console.log('Seeding sensors...');
        await Sensor.insertMany(seedSensors);

        console.log('Database seeded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

seedDatabase();

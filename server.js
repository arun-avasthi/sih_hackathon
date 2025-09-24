const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const WebSocket = require('ws');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/jalrakshak', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Sensor Data Schema
const sensorSchema = new mongoose.Schema({
    sensorId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    location: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
    },
    readings: {
        ph: { type: Number, required: true },
        turbidity: { type: Number, required: true },
        temperature: { type: Number, required: true },
        dissolvedOxygen: { type: Number, required: true }
    },
    status: { 
        type: String, 
        enum: ['healthy', 'moderate', 'critical'], 
        required: true 
    },
    timestamp: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
});

const Sensor = mongoose.model('Sensor', sensorSchema);

// Alert Schema
const alertSchema = new mongoose.Schema({
    sensorId: { type: String, required: true },
    location: { type: String, required: true },
    severity: { 
        type: String, 
        enum: ['low', 'moderate', 'high', 'critical'], 
        required: true 
    },
    message: { type: String, required: true },
    parameters: {
        ph: Number,
        turbidity: Number,
        temperature: Number,
        dissolvedOxygen: Number
    },
    isResolved: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
});

const Alert = mongoose.model('Alert', alertSchema);

// AI Prediction Schema
const predictionSchema = new mongoose.Schema({
    sensorId: { type: String, required: true },
    location: { type: String, required: true },
    predictedRisk: {
        type: String,
        enum: ['low', 'medium', 'high'],
        required: true
    },
    confidence: { type: Number, required: true }, // Percentage
    timeframe: { type: String, required: true },
    predictedParameters: {
        ph: Number,
        turbidity: Number,
        temperature: Number,
        dissolvedOxygen: Number
    },
    timestamp: { type: Date, default: Date.now }
});

const Prediction = mongoose.model('Prediction', predictionSchema);

// WebSocket Server for Real-time Updates
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', function connection(ws) {
    console.log('Client connected to WebSocket');
    
    ws.on('message', function incoming(message) {
        console.log('Received:', message);
    });

    ws.on('close', function close() {
        console.log('Client disconnected from WebSocket');
    });
});

// Broadcast function for real-time updates
function broadcast(data) {
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// API Routes

// Get all sensors with latest readings
app.get('/api/sensors', async (req, res) => {
    try {
        const sensors = await Sensor.find({ isActive: true })
            .sort({ timestamp: -1 });
        res.json({
            success: true,
            data: sensors,
            total: sensors.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching sensors',
            error: error.message
        });
    }
});

// Get specific sensor data
app.get('/api/sensors/:sensorId', async (req, res) => {
    try {
        const sensor = await Sensor.findOne({ 
            sensorId: req.params.sensorId,
            isActive: true 
        });
        
        if (!sensor) {
            return res.status(404).json({
                success: false,
                message: 'Sensor not found'
            });
        }

        res.json({
            success: true,
            data: sensor
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching sensor data',
            error: error.message
        });
    }
});

// Update sensor readings (IoT endpoint)
app.post('/api/sensors/:sensorId/readings', async (req, res) => {
    try {
        const { ph, turbidity, temperature, dissolvedOxygen } = req.body;
        
        // Validate readings
        if (!ph || !turbidity || !temperature || !dissolvedOxygen) {
            return res.status(400).json({
                success: false,
                message: 'All readings (pH, turbidity, temperature, dissolved oxygen) are required'
            });
        }

        // Determine status based on readings
        let status = 'healthy';
        if (ph < 6.5 || ph > 8.5 || turbidity > 25 || dissolvedOxygen < 5) {
            status = 'moderate';
        }
        if (ph < 5.5 || ph > 9.0 || turbidity > 35 || dissolvedOxygen < 3) {
            status = 'critical';
        }

        const sensor = await Sensor.findOneAndUpdate(
            { sensorId: req.params.sensorId },
            {
                readings: { ph, turbidity, temperature, dissolvedOxygen },
                status,
                timestamp: new Date()
            },
            { new: true, upsert: true }
        );

        // Check for alert conditions
        if (status === 'critical') {
            const alert = new Alert({
                sensorId: req.params.sensorId,
                location: sensor.name,
                severity: 'critical',
                message: `Critical water quality detected: pH ${ph}, Turbidity ${turbidity} NTU, DO ${dissolvedOxygen} mg/L`,
                parameters: { ph, turbidity, temperature, dissolvedOxygen }
            });
            await alert.save();

            // Broadcast alert
            broadcast({
                type: 'alert',
                data: alert
            });
        }

        // Broadcast sensor update
        broadcast({
            type: 'sensor_update',
            data: sensor
        });

        res.json({
            success: true,
            data: sensor,
            message: 'Sensor readings updated successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating sensor readings',
            error: error.message
        });
    }
});

// Get all active alerts
app.get('/api/alerts', async (req, res) => {
    try {
        const alerts = await Alert.find({ isResolved: false })
            .sort({ timestamp: -1 })
            .limit(50);

        res.json({
            success: true,
            data: alerts,
            total: alerts.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching alerts',
            error: error.message
        });
    }
});

// Resolve alert
app.put('/api/alerts/:alertId/resolve', async (req, res) => {
    try {
        const alert = await Alert.findByIdAndUpdate(
            req.params.alertId,
            { isResolved: true },
            { new: true }
        );

        if (!alert) {
            return res.status(404).json({
                success: false,
                message: 'Alert not found'
            });
        }

        // Broadcast alert resolution
        broadcast({
            type: 'alert_resolved',
            data: alert
        });

        res.json({
            success: true,
            data: alert,
            message: 'Alert resolved successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error resolving alert',
            error: error.message
        });
    }
});

// Get AI predictions
app.get('/api/predictions', async (req, res) => {
    try {
        const predictions = await Prediction.find()
            .sort({ timestamp: -1 })
            .limit(10);

        res.json({
            success: true,
            data: predictions
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching predictions',
            error: error.message
        });
    }
});

// Generate AI prediction (ML endpoint)
app.post('/api/predictions/generate', async (req, res) => {
    try {
        // Get recent sensor data for ML processing
        const recentSensors = await Sensor.find({ isActive: true })
            .sort({ timestamp: -1 })
            .limit(10);

        // Simple ML logic (replace with actual ML model)
        const predictions = recentSensors.map(sensor => {
            const { ph, turbidity, dissolvedOxygen } = sensor.readings;
            
            let risk = 'low';
            let confidence = 75;
            
            if (ph < 6.0 || turbidity > 30 || dissolvedOxygen < 4) {
                risk = 'high';
                confidence = 85;
            } else if (ph < 6.5 || turbidity > 20 || dissolvedOxygen < 5) {
                risk = 'medium';
                confidence = 80;
            }

            return new Prediction({
                sensorId: sensor.sensorId,
                location: sensor.name,
                predictedRisk: risk,
                confidence,
                timeframe: 'Next 6 hours',
                predictedParameters: {
                    ph: ph - (Math.random() * 0.5),
                    turbidity: turbidity + (Math.random() * 5),
                    temperature: sensor.readings.temperature + (Math.random() * 2),
                    dissolvedOxygen: dissolvedOxygen - (Math.random() * 0.3)
                }
            });
        });

        await Prediction.insertMany(predictions);

        // Broadcast predictions
        broadcast({
            type: 'predictions_updated',
            data: predictions
        });

        res.json({
            success: true,
            data: predictions,
            message: 'AI predictions generated successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error generating predictions',
            error: error.message
        });
    }
});

// Get dashboard statistics
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const totalSensors = await Sensor.countDocuments({ isActive: true });
        const healthySensors = await Sensor.countDocuments({ 
            status: 'healthy', 
            isActive: true 
        });
        const moderateSensors = await Sensor.countDocuments({ 
            status: 'moderate', 
            isActive: true 
        });
        const criticalSensors = await Sensor.countDocuments({ 
            status: 'critical', 
            isActive: true 
        });
        const activeAlerts = await Alert.countDocuments({ isResolved: false });

        // Calculate average readings
        const avgReadings = await Sensor.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: null,
                    avgPH: { $avg: '$readings.ph' },
                    avgTurbidity: { $avg: '$readings.turbidity' },
                    avgTemperature: { $avg: '$readings.temperature' },
                    avgOxygen: { $avg: '$readings.dissolvedOxygen' }
                }
            }
        ]);

        const stats = {
            totalSensors,
            healthySensors,
            moderateSensors,
            criticalSensors,
            activeAlerts,
            overallWQI: Math.round((healthySensors / totalSensors) * 100),
            avgReadings: avgReadings[0] || {
                avgPH: 0,
                avgTurbidity: 0,
                avgTemperature: 0,
                avgOxygen: 0
            }
        };

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard statistics',
            error: error.message
        });
    }
});

// Generate report
app.post('/api/reports/generate', async (req, res) => {
    try {
        const { startDate, endDate, sensorIds } = req.body;

        const query = {
            timestamp: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        };

        if (sensorIds && sensorIds.length > 0) {
            query.sensorId = { $in: sensorIds };
        }

        const sensorData = await Sensor.find(query).sort({ timestamp: -1 });
        const alerts = await Alert.find(query).sort({ timestamp: -1 });

        const report = {
            period: { startDate, endDate },
            summary: {
                totalReadings: sensorData.length,
                totalAlerts: alerts.length,
                avgWQI: Math.round(
                    sensorData.reduce((sum, s) => sum + (s.status === 'healthy' ? 100 : s.status === 'moderate' ? 70 : 40), 0) / sensorData.length
                )
            },
            sensorData,
            alerts
        };

        res.json({
            success: true,
            data: report
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error generating report',
            error: error.message
        });
    }
});

// Citizen app - get area status
app.get('/api/citizen/area/:areaId', async (req, res) => {
    try {
        const areaId = req.params.areaId;
        
        // Map area IDs to sensor locations (simplified)
        const areaMapping = {
            'connaught-place': ['sensor-6'],
            'karol-bagh': ['sensor-7'],
            'lajpat-nagar': ['sensor-8'],
            'dwarka': ['sensor-9']
        };

        const sensorIds = areaMapping[areaId] || [];
        const sensors = await Sensor.find({
            sensorId: { $in: sensorIds },
            isActive: true
        });

        if (sensors.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No sensors found for this area'
            });
        }

        // Calculate area status
        const statuses = sensors.map(s => s.status);
        const hasCritical = statuses.includes('critical');
        const hasModerate = statuses.includes('moderate');

        let overallStatus = 'good';
        if (hasCritical) overallStatus = 'critical';
        else if (hasModerate) overallStatus = 'moderate';

        const avgReadings = {
            ph: sensors.reduce((sum, s) => sum + s.readings.ph, 0) / sensors.length,
            turbidity: sensors.reduce((sum, s) => sum + s.readings.turbidity, 0) / sensors.length,
            temperature: sensors.reduce((sum, s) => sum + s.readings.temperature, 0) / sensors.length,
            dissolvedOxygen: sensors.reduce((sum, s) => sum + s.readings.dissolvedOxygen, 0) / sensors.length
        };

        res.json({
            success: true,
            data: {
                areaId,
                status: overallStatus,
                sensors: sensors.length,
                readings: avgReadings,
                lastUpdated: new Date().toISOString()
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching area status',
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'JalRakshak API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`JalRakshak server running on port ${PORT}`);
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    mongoose.connection.close();
    process.exit(0);
});

module.exports = app;

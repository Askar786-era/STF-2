const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const Donor = require('./models/Donor');
const Stats = require('./models/Stats');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const onlineDonors = {}; 

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'STF.html'));
});

// Database Connection — Uses Atlas (MONGODB_URI env var) on Render, falls back to local for dev
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/stranger_to_friends";

mongoose.connect(MONGODB_URI)
    .then(async () => {
        const dbType = process.env.MONGODB_URI ? "☁️ MongoDB Atlas" : "💻 Local MongoDB";
        console.log(`✅ SUCCESS: Connected to ${dbType}!`);
        const stats = ['bloodRequests', 'livesSaved'];
        for (const key of stats) {
            await Stats.findOneAndUpdate({ key }, { $setOnInsert: { value: 0 } }, { upsert: true });
        }
    })
    .catch(err => {
        console.error("❌ CONNECTION ERROR:", err.message);
        console.log("TIP: Try switching to a Mobile Hotspot if your WiFi blocks MongoDB.");
    });

io.on('connection', (socket) => {
    // Initial count (Total Registered Donors)
    Donor.countDocuments().then(count => socket.emit('donorCountUpdate', count));
    
    Stats.find({}).then(allStats => {

        const statsObj = {};
        allStats.forEach(s => statsObj[s.key] = s.value);
        socket.emit('globalStatsUpdate', statsObj);
    });

    socket.on('donorOnline', async (phone) => {
        await Donor.findOneAndUpdate({ phone }, { isOnline: true, socketId: socket.id });
        onlineDonors[phone] = socket.id;
        // We still show total registered donors on the home page stats for "Active Donors"
        io.emit('donorCountUpdate', await Donor.countDocuments());
    });

    socket.on('disconnect', async () => {
        await Donor.findOneAndUpdate({ socketId: socket.id }, { isOnline: false, socketId: null });
        io.emit('donorCountUpdate', await Donor.countDocuments());
    });



    // Call Signaling
    socket.on('callUser', async ({ donorPhone, signalData, callerName }) => {
        const donor = await Donor.findOne({ phone: donorPhone });
        if (donor && donor.isOnline && donor.socketId) {
            io.to(donor.socketId).emit('incomingCall', { signal: signalData, from: callerName, callerSocket: socket.id });
        } else if (donor) {
            // Donor is offline - Send SMS Notification (Simulation)
            console.log(`[URGENT SMS SIMULATION] To: ${donorPhone} | Message: "URGENT BLOOD ALERT: ${callerName} needs your help! Please log in to Stranger to Friends immediately to accept the call."`);
            socket.emit('callError', { message: 'Donor is offline. An urgent SMS notification has been sent to them!' });
        } else {
            socket.emit('callError', { message: 'Donor not found.' });
        }
    });


    socket.on('answerCall', (data) => io.to(data.to).emit('callAccepted', { signal: data.signal, donorSocket: socket.id }));
    socket.on('iceCandidate', (data) => io.to(data.to).emit('iceCandidate', data.candidate));
});

// API Routes
app.post('/api/donors', async (req, res) => {
    const newDonor = new Donor(req.body);
    await newDonor.save();
    io.emit('donorCountUpdate', await Donor.countDocuments());
    res.status(201).json({ success: true });
});

app.post('/api/login', async (req, res) => {
    const donor = await Donor.findOne(req.body);
    res.json({ success: !!donor, donor });
});

app.get('/api/donors/search', async (req, res) => {
    const { bloodGroup, city, state, zipCode } = req.query;
    let query = { bloodGroup };
    if (city) query.city = { $regex: new RegExp(city, "i") };
    if (state) query.state = { $regex: new RegExp(state, "i") };
    if (zipCode) query.zipCode = zipCode;
    
    const donors = await Donor.find(query).select('-password');
    
    const stat = await Stats.findOneAndUpdate({ key: 'bloodRequests' }, { $inc: { value: 1 } }, { upsert: true, new: true });
    io.emit('globalStatsUpdate', { bloodRequests: stat.value });
    res.json(donors);
});


app.get('/api/stats', async (req, res) => {
    const allStats = await Stats.find({});
    const statsObj = { activeDonors: await Donor.countDocuments() };
    allStats.forEach(s => statsObj[s.key] = s.value);
    res.json(statsObj);
});

app.post('/api/messages/send', async (req, res) => {
    console.log(`[SMS SIMULATION] To: ${req.body.donorPhone} | Message: ${req.body.message}`);
    const stat = await Stats.findOneAndUpdate({ key: 'livesSaved' }, { $inc: { value: 1 } }, { upsert: true, new: true });
    io.emit('globalStatsUpdate', { livesSaved: stat.value });
    res.json({ success: true });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

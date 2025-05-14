const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const Razorpay = require("razorpay");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123haiyeh';

 

app.use(cors({ origin: '*' })); // For development

app.use(bodyParser.json());

// Database Connection
mongoose.connect('mongodb+srv://sainisaifi:jqc.rE8DpDNyZv9@cluster0.hgnniox.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// Razorpay Configuration (Use Test Keys for Development)
const razorpay = new Razorpay({
   key_id: "rzp_live_yM16oFWJdJcJ6M",
  key_secret: "Zaiqe8KaUkviJjKUGIUBz92j" // Replace with your test secret
});

// Payment Endpoints
app.post("/create-order", async (req, res) => {
  try {
    const { amount, currency = "INR" } = req.body;

    // Validate request parameters
    if (!amount || isNaN(amount) || amount < 100) {
      return res.status(400).json({ 
        error: "Invalid amount. Minimum value is 100 paise (₹1)" 
      });
    }

    const options = {
      amount: Number(amount),
      currency,
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1
    };

    const order = await razorpay.orders.create(options);
    
    res.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status
    });

  } catch (err) {
    console.error("🚨 Create Order Error:", err.error || err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      error: "Payment initialization failed",
      details: err.error?.description || err.message
    });
  }
});

app.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification data" });
    }

    const generatedSignature = crypto
      .createHmac("sha256", razorpay.key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ 
        success: false,
        error: "Payment signature mismatch"
      });
    }

    // Here you would typically save payment details to your database
    res.json({ 
      success: true,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id
    });

  } catch (err) {
    console.error("🚨 Payment Verification Error:", err);
    res.status(500).json({ 
      error: "Payment verification failed",
      details: err.message
    });
  }
});

// User Authentication Routes
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,
  tokens: [String]
}));

// JWT Authentication Middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('Authorization required');

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({ 
      _id: decoded.id,
      tokens: token
    });

    if (!user) throw new Error('User not found');
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Authentication failed", details: err.message });
  }
};

app.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });

    if (existingUser) {
      return res.status(400).json({ error: "Username or email already exists" });
    }

    const user = new User({ username, email, password });
    await user.save();
    
    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    res.status(400).json({ error: "Registration failed", details: err.message });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || user.password !== password) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
    user.tokens.push(token);
    await user.save();

    res.json({ 
      message: "Login successful",
      token,
      username: user.username
    });
  } catch (err) {
    res.status(401).json({ error: "Authentication failed", details: err.message });
  }
});

app.post('/logout', authenticate, async (req, res) => {
  try {
    req.user.tokens = req.user.tokens.filter(t => t !== req.token);
    await req.user.save();
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ error: "Logout failed", details: err.message });
  }
});

// Protected Routes
app.get('/videos', authenticate, (req, res) => {
  res.json({
    videos: [
      "https://videolecture.s3.eu-north-1.amazonaws.com/Part-1.webm",
      "https://videolecture.s3.eu-north-1.amazonaws.com/Part-2.webm"
    ]
  });
});

// Server Initialization
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 Local: http://localhost:${PORT}`);
});

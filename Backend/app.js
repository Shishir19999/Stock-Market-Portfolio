import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';

// Define stock schema
const stockSchema = new mongoose.Schema({
    company: String,
    description: String,
    initial_price: Number,
    price_2002: Number,
    price_2007: Number,
    symbol: String,
});

// Create stock model
const Stock = mongoose.models.Stock || mongoose.model("Stock", stockSchema);

// Watchlist entries live in their own collection so they never show up in the stock listing.
const watchlistSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true, uppercase: true, trim: true },
    company: String,
    description: String,
    initial_price: Number,
    price_2002: Number,
    price_2007: Number,
}, { timestamps: true });
const Watchlist = mongoose.models.Watchlist || mongoose.model("Watchlist", watchlistSchema);

const num = (v) => (v === undefined || v === null || v === "" ? undefined : Number(v));

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createApp() {
const app = express();

// CORS_ORIGIN: comma-separated allowed origins (e.g. http://localhost:5173,http://192.168.1.20:5173); unset = any origin.
const origins = (process.env.CORS_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : {}));
app.use(express.json());

// Paginated: ?page=1&limit=12&search=text (company, symbol or description)
//   -> { data, page, limit, total, pages }
app.get("/api/stocks", async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 12));
        const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
        let filter = {};
        if (search) {
            const rx = new RegExp(escapeRegex(search), "i");
            filter = { $or: [{ company: rx }, { symbol: rx }, { description: rx }] };
        }
        const total = await Stock.countDocuments(filter);
        const data = await Stock.find(filter).sort({ company: 1, _id: 1 }).skip((page - 1) * limit).limit(limit);
        res.json({ data, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/api/watchlist", async (req, res) => {
    try {
        res.json(await Watchlist.find().sort({ createdAt: 1 }));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/api/watchlist", async (req, res) => {
    try {
        const body = req.body || {};
        if (typeof body.symbol !== "string" || !body.symbol.trim()) {
            return res.status(400).json({ error: "symbol is required" });
        }
        const prices = {};
        for (const f of ["initial_price", "price_2002", "price_2007"]) {
            const v = num(body[f]);
            if (v !== undefined && !Number.isFinite(v)) {
                return res.status(400).json({ error: `${f} must be a number` });
            }
            prices[f] = v;
        }
        const symbol = body.symbol.trim().toUpperCase();
        if (await Watchlist.exists({ symbol })) {
            return res.status(409).json({ error: "Stock is already in the watchlist" });
        }
        await Watchlist.create({
            symbol,
            company: typeof body.company === "string" ? body.company : undefined,
            description: typeof body.description === "string" ? body.description : undefined,
            ...prices,
        });
        res.status(201).json({ message: "Stock added to watchlist successfully" });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ error: "Stock is already in the watchlist" });
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.delete("/api/watchlist/:symbol", async (req, res) => {
    try {
        const r = await Watchlist.findOneAndDelete({ symbol: req.params.symbol.toUpperCase() });
        if (!r) return res.status(404).json({ error: "Not in watchlist" });
        res.json({ message: "Stock removed from watchlist" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Global error handler middleware
app.use((err, req, res, next) => {
    if (err.status && err.status < 500) {
        return res.status(err.status).json({ error: "Invalid request body" });
    }
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong" });
});


return app;
}

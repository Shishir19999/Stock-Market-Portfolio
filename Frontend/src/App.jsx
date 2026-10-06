import { useState, useEffect } from "react";
import {
    BrowserRouter as Router,
    Routes,
    Route,
    NavLink,
    Navigate,
} from "react-router-dom";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

// Compare the previous price (2002) with the current/latest one (2007):
// green = went up, red = went down, inherit colour when unchanged/unknown.
const getPriceColor = (stock) => {
    const previous = stock.price_2002;
    const current = stock.price_2007;
    if (typeof previous !== "number" || typeof current !== "number") {
        return undefined;
    }
    if (current > previous) return "#00AA00";
    if (current < previous) return "#FF0000";
    return undefined;
};

const PAGE_SIZE = 12;

const Stocks = ({ addToWatchlist }) => {
    const [stocks, setStocks] = useState([]);
    const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
    const [page, setPage] = useState(1);
    const [text, setText] = useState("");
    const [search, setSearch] = useState("");

    // Debounce the search box
    useEffect(() => {
        if (text.trim() === search) return undefined;
        const id = setTimeout(() => {
            setSearch(text.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(id);
    }, [text, search]);

    useEffect(() => {
        // Fetch one page of stock data from the backend
        const params = new URLSearchParams({ page, limit: PAGE_SIZE, search });
        fetch(`${API_URL}/api/stocks?${params}`)
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(({ data, ...rest }) => {
                setStocks(data);
                setMeta(rest);
            })
            .catch((error) => console.error("Error fetching stocks:", error));
    }, [page, search]);

    return (
        <div className="App">
            <h1>Stock Market MERN App</h1>
            <h2>Stocks ({meta.total})</h2>
            <div className="pager">
                <input
                    type="search"
                    aria-label="Search stocks"
                    placeholder="Search company, symbol..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />
                <button data-testid="prev-page" disabled={meta.page <= 1} onClick={() => setPage(meta.page - 1)}>
                    Prev
                </button>
                <span data-testid="page-info">
                    Page {meta.page} of {meta.pages}
                </span>
                <button data-testid="next-page" disabled={meta.page >= meta.pages} onClick={() => setPage(meta.page + 1)}>
                    Next
                </button>
            </div>
            <ul>
                {stocks.map((stock) => (
                    <li key={stock._id ?? stock.symbol}>
                        {stock.company} ({stock.symbol}) -
                        <span style={{ color: getPriceColor(stock) }}>
                            {" "}
                            ${stock.initial_price}
                        </span>
                        <button onClick={() => addToWatchlist(stock)}>
                            Add to My Watchlist
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const Watchlist = ({ watchlist }) => {
    return (
        <div className="App">
            <h1>Stock Market MERN App</h1>
            <h2>My Watchlist</h2>
            <ul>
                {watchlist.map((stock, index) => (
                    <li key={`${stock._id ?? stock.symbol}-${index}`}>
                        {stock.company} ({stock.symbol}) -
                        <span style={{ color: getPriceColor(stock) }}>
                            {" "}
                            ${stock.initial_price}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

function App() {
    const [watchlist, setWatchlist] = useState([]);

    // Restore the saved watchlist on load
    useEffect(() => {
        fetch(`${API_URL}/api/watchlist`)
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((data) => setWatchlist(data))
            .catch((error) => console.error("Error fetching watchlist:", error));
    }, []);

    const addToWatchlist = (stock) => {
        // Add stock to watchlist
        fetch(`${API_URL}/api/watchlist`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(stock),
        })
            .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                return data;
            })
            .then((data) => {
                // Show an alert with the message received from the server
                alert(data.message);
                setWatchlist((prev) => (prev.some((s) => s.symbol === stock.symbol) ? prev : [...prev, stock]));
            })
            .catch((error) => {
                console.error("Error adding to watchlist:", error);
                alert(error.message || "Could not add the stock to the watchlist.");
            });
    };

    return (
        <Router>
            <nav>
                <NavLink to="/stocks">Stocks</NavLink>
                <NavLink to="/watchlist">Watchlist</NavLink>
            </nav>
            <Routes>
                <Route path="/" element={<Navigate to="/stocks" replace />} />
                <Route
                    path="/stocks"
                    element={<Stocks addToWatchlist={addToWatchlist} />}
                />
                <Route
                    path="/watchlist"
                    element={<Watchlist watchlist={watchlist} />}
                />
            </Routes>
        </Router>
    );
}

export default App;

```javascript
/**
 * Tjoen High-Risk High-Reward Market Maker Engine
 * File simulasi pergerakan bursa Tjoen versi volatilitas ekstrem.
 * Diperbaiki menggunakan jalur dokumen 6 segmen terstruktur ('state', 'current').
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Ambil konfigurasi environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'tjoen-exchange-app';
const firebaseConfig = JSON.parse(__firebase_config);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Parameter dasar Koin Tjoen
const INITIAL_PRICE = 17000.0;
const MAX_COIN_SUPPLY = 25000000;

// Daftar Status Pasar Liar (Event)
const MARKET_EVENTS = [
    { name: "NORMAL", chance: 0.65 },
    { name: "PUMP_BY_WHALE", chance: 0.12 }, // Pompa harga oleh paus (+15% s/d +50%)
    { name: "PANIC_SELL", chance: 0.12 },    // Kepanikan pasar (-10% s/d -35%)
    { name: "FLASH_CRASH", chance: 0.06 },   // Jatuh ekstrem mendadak (-40% s/d -70%)
    { name: "MEGA_REBOUND", chance: 0.05 }   // Pemulihan luar biasa setelah crash (+30% s/d +80%)
];

function getWitaTime() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8)); // UTC+8 WITA
}

async function runHighRiskEngine() {
    const wita = getWitaTime();
    const hours = wita.getHours();
    const minutes = wita.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    const startMinutes = 4 * 60 + 30; // 04:30 WITA
    const endMinutes = 21 * 60;       // 21:00 WITA

    // Diperbaiki menggunakan jalur dokumen 6 segmen yang valid
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'state', 'current');
    let snap = await getDoc(docRef);
    let state = snap.exists() ? snap.data() : null;

    if (!state) {
        state = {
            currentPrice: INITIAL_PRICE,
            openingPrice: INITIAL_PRICE,
            closingPrice: INITIAL_PRICE,
            high24h: INITIAL_PRICE,
            low24h: INITIAL_PRICE,
            usdRate: 15900.0,
            circulatingSupply: 1500000.0,
            priceHistory: [{ time: "04:30", price: INITIAL_PRICE }]
        };
        await setDoc(docRef, state);
        return;
    }

    // 1. CEK OPERASIONAL JAM PASAR
    const isMarketOpen = totalMinutes >= startMinutes && totalMinutes < endMinutes;

    if (!isMarketOpen) {
        if (state.currentPrice !== state.closingPrice) {
            console.log("Kunci nilai closing harian...");
            await setDoc(docRef, {
                ...state,
                closingPrice: state.currentPrice,
                openingPrice: state.currentPrice, // Besok pagi dimulai dari harga penutupan hari ini
                high24h: state.currentPrice,
                low24h: state.currentPrice
            }, { merge: true });
        }
        return; // Pasar sedang tutup
    }

    // 2. ALGORITMA HIGH-RISK HIGH-REWARD (VOLATILITAS EKSTREM)
    let priceShiftPct = 0.0;
    
    // Tentukan Event Pasar saat ini secara acak
    const eventRoll = Math.random();
    let selectedEvent = "NORMAL";
    let cumulativeChance = 0;

    for (const ev of MARKET_EVENTS) {
        cumulativeChance += ev.chance;
        if (eventRoll <= cumulativeChance) {
            selectedEvent = ev.name;
            break;
        }
    }

    // Pengaruh kontrol eksternal Kurs USD/IDR dari Anda (Admin)
    const adminBoost = (state.usdRate - 15900) / 1000; 

    // Logika Perubahan Harga Berdasarkan Event
    switch (selectedEvent) {
        case "NORMAL":
            priceShiftPct = (Math.random() - 0.46) * 7;
            break;
        case "PUMP_BY_WHALE":
            priceShiftPct = (Math.random() * 35) + 10;
            console.log("🐋 EVENT: Paus menyuntikkan dana ke Koin Tjoen!");
            break;
        case "PANIC_SELL":
            priceShiftPct = -((Math.random() * 22) + 8);
            console.log("😰 EVENT: Panic Selling melanda bursa Tjoen!");
            break;
        case "FLASH_CRASH":
            priceShiftPct = -((Math.random() * 30) + 35);
            console.log("💥 EVENT: Flash Crash! Harga Tjoen runtuh mendadak!");
            break;
        case "MEGA_REBOUND":
            priceShiftPct = (Math.random() * 50) + 25;
            console.log("🚀 EVENT: Mega Rebound! Koin Tjoen terbang ke langit!");
            break;
    }

    // Tambahkan pengaruh Kurs Admin
    priceShiftPct += adminBoost;

    // Hitung Harga Baru
    let nextPrice = state.currentPrice * (1 + priceShiftPct / 100);
    nextPrice = Math.max(100.0, Math.round(nextPrice * 10) / 10);

    // Catat Batas Tinggi & Rendah Harian
    const nextHigh = Math.max(state.high24h, nextPrice);
    const nextLow = Math.min(state.low24h, nextPrice);

    // Sinkronkan ke Histori Chart
    const timeString = wita.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    let updatedHistory = [...state.priceHistory, { time: timeString, price: nextPrice }];
    
    if (updatedHistory.length > 60) {
        updatedHistory.shift();
    }

    // Tulis data terbaru ke cloud Firestore
    await setDoc(docRef, {
        ...state,
        currentPrice: nextPrice,
        high24h: nextHigh,
        low24h: nextLow,
        priceHistory: updatedHistory
    }, { merge: true });

    console.log(`[High-Risk Engine] Event: ${selectedEvent} | Harga Baru: Rp ${Math.round(nextPrice).toLocaleString('id-ID')} (${priceShiftPct >= 0 ? '+' : ''}${priceShiftPct.toFixed(2)}%)`);
}

// Jalankan engine penggerak volatilitas tinggi ini setiap 4 detik untuk transaksi yang lebih dinamis
setInterval(runHighRiskEngine, 4000);

```

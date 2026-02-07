/* --- ১. কনফিগারেশন এবং স্মার্ট কন্ট্রাক্ট ডাটা --- */

// আপনার NetGuard Final কন্ট্রাক্ট অ্যাড্রেস
const NETGUARD_CONTRACT_ADDRESS = "0x896a0bFe60deC04a7AC35a0046BC6dD755396708"; 

// আপনার টোকেন (USDT) অ্যাড্রেস
const USDT_ADDRESS = "0x566bA3A91497E66eb6D309FfC3F1228447619BcE";

// NetGuard কন্ট্রাক্ট ABI (শুধু আমাদের যা যা দরকার)
const NETGUARD_ABI = [
    // অর্ডার প্লেস করার ফাংশন
    "function placeOrder(uint256 _productId, string memory _currency) external",
    // প্রোডাক্ট দেখার ফাংশন
    "function products(uint256) view returns (uint256 id, string name, uint256 price, bool isActive)"
];

// ERC-20 ABI (Approve করার জন্য)
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

// প্রোডাক্ট লিস্ট (Solidity তে productCount 1 থেকে শুরু হয়, তাই ID 1, 2, 3, 4 দেওয়া হলো)
const productList = [
    { id: 1, name: "Starter Residential", price: 15, features: ["1 Static IP", "US/UK Locations"] }, 
    { id: 2, name: "Pro Dedicated", price: 45, features: ["5 Static IPs", "Global Locations"] },     
    { id: 3, name: "Private VPS", price: 85, features: ["4 Core / 8GB RAM", "Root Access"] },        
    { id: 4, name: "Lifetime Survey Expert", price: 199, features: ["Fresh IP Rotation", "Survey Optimized"], isPopular: true } 
];

/* --- ২. UI লজিক --- */
document.addEventListener('DOMContentLoaded', () => {
    renderProducts();
    setupEventListeners();
});

function renderProducts() {
    const container = document.getElementById('pricing-container');
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
                <button class="btn btn-primary btn-block" onclick="openCheckout(${product.id})">Order Now</button>
            </div>
        `;
        container.innerHTML += html;
    });
}

// Modal Variables
const modal = document.getElementById('checkout-modal');
const modalPlanName = document.getElementById('modal-plan-name');
const modalPlanPrice = document.getElementById('modal-plan-price');
let selectedProduct = null;

function openCheckout(productId) {
    selectedProduct = productList.find(p => p.id === productId);
    if (!selectedProduct) return;

    modalPlanName.innerText = selectedProduct.name;
    modalPlanPrice.innerText = selectedProduct.price.toFixed(2);
    modal.classList.remove('hidden');
    
    // রিসেট স্ট্যাটাস মেসেজ
    document.getElementById('status-msg').innerHTML = "";
}

function setupEventListeners() {
    document.getElementById('close-modal').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('connect-wallet-btn').addEventListener('click', connectWallet);
    document.getElementById('checkout-form').addEventListener('submit', handlePayment);
}

/* --- ৩. Web3 লজিক (ইন্টিগ্রেশন) --- */
let provider, signer, userAddress;

async function connectWallet() {
    const btn = document.getElementById('connect-wallet-btn');
    if (typeof window.ethereum !== 'undefined') {
        try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            
            signer = provider.getSigner();
            userAddress = await signer.getAddress();
            
            btn.innerText = `...${userAddress.slice(-4)}`;
            btn.classList.remove('btn-outline');
            btn.classList.add('btn-primary');
        } catch (error) {
            console.error(error);
            alert("Connection Failed!");
        }
    } else {
        alert("Please install MetaMask!");
    }
}

async function handlePayment(e) {
    e.preventDefault();
    const statusMsg = document.getElementById('status-msg');
    
    if (!signer) {
        statusMsg.innerHTML = "<span class='status-error'>আগে Wallet Connect করুন!</span>";
        return;
    }

    // কারেন্সি এবং টোকেন সিলেকশন (আপাতত দুইটাই আপনার সেইম USDT অ্যাড্রেস)
    const currency = document.querySelector('input[name="currency"]:checked').value; 
    const tokenAddress = USDT_ADDRESS; 

    statusMsg.innerText = "Processing...";
    statusMsg.style.color = "#6366f1"; 

    try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const netGuardContract = new ethers.Contract(NETGUARD_CONTRACT_ADDRESS, NETGUARD_ABI, signer);

        // ১. ডেসিমেল বের করা
        let decimals = 18;
        try { decimals = await tokenContract.decimals(); } catch(e) {}
        
        // প্রাইস কনভার্শন (Ether/Token Unit এ)
        const priceAmount = ethers.utils.parseUnits(selectedProduct.price.toString(), decimals);

        // ২. এলাউন্স চেক করা (আগে অ্যাপ্রুভ করা আছে কিনা)
        const currentAllowance = await tokenContract.allowance(userAddress, NETGUARD_CONTRACT_ADDRESS);

        if (currentAllowance.lt(priceAmount)) {
            statusMsg.innerText = "১. অ্যাপ্রুভাল প্রসেসিং হচ্ছে... (MetaMask চেক করুন)";
            const approveTx = await tokenContract.approve(NETGUARD_CONTRACT_ADDRESS, priceAmount);
            statusMsg.innerText = "Approve কনফার্মেশনের জন্য অপেক্ষা করছি...";
            await approveTx.wait();
            console.log("Approved:", approveTx.hash);
        } else {
            console.log("Already Approved, skipping approval step.");
        }

        // ৩. অর্ডার প্লেস করা (placeOrder)
        statusMsg.innerText = "২. অর্ডার প্লেস করা হচ্ছে... Confirm করুন";
        
        // কন্ট্রাক্ট ফাংশন: placeOrder(productId, currencyString)
        const orderTx = await netGuardContract.placeOrder(selectedProduct.id, currency);
        
        statusMsg.innerText = "অর্ডার কনফার্মেশনের জন্য অপেক্ষা করছি...";
        await orderTx.wait();

        // ৪. সফল!
        statusMsg.innerHTML = `
            <span class='status-success'>
                <i class="ri-check-double-line"></i> অর্ডার সফল হয়েছে! <br>
                <small>Trx: ${orderTx.hash.slice(0, 10)}...</small><br>
                <small style="color:#0f172a;">(অ্যাডমিন শীঘ্রই পেমেন্ট কালেক্ট করে এক্টিভ করবে)</small>
            </span>
        `;
        console.log("Order Placed:", orderTx);

    } catch (error) {
        console.error("Error:", error);
        
        if (error.code === 'ACTION_REJECTED') {
            statusMsg.innerHTML = "<span class='status-error'>আপনি ট্রানজেকশন বাতিল করেছেন।</span>";
        } else if (error.message && error.message.includes("Product unavailable")) {
             statusMsg.innerHTML = "<span class='status-error'>এই প্রোডাক্টটি অ্যাক্টিভ নেই বা ভুল আইডি।</span>";
        } else if (error.message && error.message.includes("transfer amount exceeds balance")) {
            statusMsg.innerHTML = "<span class='status-error'>আপনার ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই।</span>";
        } else {
            statusMsg.innerHTML = "<span class='status-error'>ত্রুটি হয়েছে! কনসোল চেক করুন।</span>";
        }
    }
}
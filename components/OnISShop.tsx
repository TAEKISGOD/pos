"use client";

import { useState, useMemo } from "react";

/* ─── Types ─── */
interface BulkPrice {
  qty: number;
  discount: number;
}

interface Product {
  id: number;
  name: string;
  category: string;
  weight: string;
  price: number;
  stock: number;
  unit: string;
  desc: string;
  color: string;
  bulkPrice: BulkPrice[];
}

interface Category {
  id: string;
  name: string;
}

interface CartProduct extends Product {
  qty: number;
  discount: number;
  finalPrice: number;
  subtotal: number;
}

/* ─── Initial Data ─── */
const INITIAL_CATEGORIES: Category[] = [
  { id: "sauce", name: "소스류" },
];

const INITIAL_PRODUCTS: Product[] = [
  {
    id: 1, name: "백설 설탕", category: "sauce",
    weight: "1kg", price: 1040, stock: 120, unit: "봉",
    desc: "백설 하얀설탕 1kg",
    color: "#f5e6d0",
    bulkPrice: [{ qty: 10, discount: 5 }, { qty: 50, discount: 8 }, { qty: 100, discount: 12 }],
  },
  {
    id: 2, name: "미쯔칸 쯔유", category: "sauce",
    weight: "1000ml", price: 12380, stock: 8, unit: "병",
    desc: "미쯔칸 쯔유 3배 농축 1L",
    color: "#2d1a0e",
    bulkPrice: [{ qty: 5, discount: 5 }, { qty: 20, discount: 10 }],
  },
  {
    id: 3, name: "샘표 진간장", category: "sauce",
    weight: "1700ml", price: 5840, stock: 65, unit: "병",
    desc: "샘표 진간장 금F3 1.7L",
    color: "#1a0f08",
    bulkPrice: [{ qty: 10, discount: 5 }, { qty: 30, discount: 10 }],
  },
];

const fmt = (n: number) => n.toLocaleString("ko-KR");

function getDiscountInfo(product: Product, qty: number) {
  let discount = 0;
  for (const bp of product.bulkPrice) {
    if (qty >= bp.qty) discount = bp.discount;
  }
  return { discount, finalPrice: Math.round(product.price * (1 - discount / 100)) };
}

/* ─── Product Image (SVG) ─── */
function ProductImage({ product, size = 180 }: { product: Pick<Product, "name" | "weight" | "unit" | "color">; size?: number }) {
  const isBottle = product.unit === "병";
  const isBag = product.unit === "봉";

  return (
    <svg width={size} height={size} viewBox="0 0 180 180" fill="none">
      {isBottle ? (
        <g>
          <rect x="76" y="14" width="28" height="10" rx="3" fill="#b0b0b0"/>
          <rect x="70" y="22" width="40" height="12" rx="2" fill="#d0d0d0"/>
          <rect x="62" y="34" width="56" height="14" rx="3" fill={product.color} opacity="0.8"/>
          <rect x="58" y="48" width="64" height="102" rx="5" fill={product.color}/>
          <rect x="58" y="48" width="64" height="102" rx="5" fill="url(#bs)" />
          <rect x="63" y="70" width="54" height="44" rx="2" fill="#fff" opacity="0.92"/>
          <text x="90" y="87" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#222" fontFamily="'Noto Sans KR',sans-serif">{product.name.split(" ").slice(-1)}</text>
          <text x="90" y="99" textAnchor="middle" fontSize="6.5" fill="#888" fontFamily="'Noto Sans KR',sans-serif">{product.weight}</text>
          <text x="90" y="110" textAnchor="middle" fontSize="5.5" fill="#bbb" fontFamily="'Noto Sans KR',sans-serif">{product.name.split(" ")[0]}</text>
          <ellipse cx="90" cy="156" rx="26" ry="3.5" fill="#000" opacity="0.05"/>
          <defs><linearGradient id="bs" x1="58" y1="48" x2="122" y2="48"><stop offset="0%" stopColor="#fff" stopOpacity="0.12"/><stop offset="45%" stopColor="#fff" stopOpacity="0"/><stop offset="100%" stopColor="#000" stopOpacity="0.06"/></linearGradient></defs>
        </g>
      ) : isBag ? (
        <g>
          <path d="M58 52Q58 42 68 38L90 28L112 38Q122 42 122 52V138Q122 146 114 146H66Q58 146 58 138Z" fill={product.color}/>
          <path d="M58 52Q58 42 68 38L90 28L112 38Q122 42 122 52V138Q122 146 114 146H66Q58 146 58 138Z" fill="url(#ps)"/>
          <rect x="70" y="25" width="40" height="7" rx="2" fill="#c8b896"/>
          <line x1="70" y1="28.5" x2="110" y2="28.5" stroke="#b0a080" strokeWidth="0.6" strokeDasharray="3 2"/>
          <rect x="65" y="68" width="50" height="42" rx="2" fill="#fff" opacity="0.93"/>
          <text x="90" y="85" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#222" fontFamily="'Noto Sans KR',sans-serif">{product.name.split(" ").slice(-1)}</text>
          <text x="90" y="97" textAnchor="middle" fontSize="6.5" fill="#888" fontFamily="'Noto Sans KR',sans-serif">{product.weight}</text>
          <text x="90" y="107" textAnchor="middle" fontSize="5.5" fill="#bbb" fontFamily="'Noto Sans KR',sans-serif">{product.name.split(" ")[0]}</text>
          <ellipse cx="90" cy="152" rx="28" ry="3.5" fill="#000" opacity="0.05"/>
          <defs><linearGradient id="ps" x1="58" y1="52" x2="122" y2="52"><stop offset="0%" stopColor="#fff" stopOpacity="0.18"/><stop offset="50%" stopColor="#fff" stopOpacity="0"/><stop offset="100%" stopColor="#000" stopOpacity="0.04"/></linearGradient></defs>
        </g>
      ) : (
        <g>
          <rect x="52" y="38" width="76" height="98" rx="6" fill={product.color}/>
          <rect x="58" y="58" width="64" height="44" rx="3" fill="#fff" opacity="0.9"/>
          <text x="90" y="83" textAnchor="middle" fontSize="8" fontWeight="700" fill="#222" fontFamily="'Noto Sans KR',sans-serif">{product.name}</text>
          <ellipse cx="90" cy="142" rx="28" ry="3.5" fill="#000" opacity="0.05"/>
        </g>
      )}
    </svg>
  );
}

/* ─── Product Card ─── */
function ProductCard({ product, cartQty, onAdd, onUpdate }: {
  product: Product; cartQty: number;
  onAdd: (id: number, qty: number) => void;
  onUpdate: (id: number, qty: number) => void;
}) {
  const [qty, setQty] = useState(1);
  const outOfStock = product.stock === 0;
  const { discount, finalPrice } = getDiscountInfo(product, cartQty || qty);

  return (
    <div style={{
      background: "#fff", borderRadius: "4px", overflow: "hidden",
      border: "1px solid #e8e8e8", display: "flex", flexDirection: "column",
      transition: "box-shadow 0.2s",
      position: "relative",
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
    >
      <div style={{
        height: "210px", background: "#fafafa",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", borderBottom: "1px solid #f0f0f0",
      }}>
        <ProductImage product={product} size={160} />
        {outOfStock && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ background: "#f5f5f5", color: "#999", padding: "6px 20px", borderRadius: "2px", fontSize: "13px", fontWeight: 600, border: "1px solid #e0e0e0" }}>일시품절</span>
          </div>
        )}
        {product.stock > 0 && product.stock <= 10 && (
          <span style={{ position: "absolute", top: 10, right: 10, color: "#e53935", fontSize: "11px", fontWeight: 600 }}>남은수량 {product.stock}개</span>
        )}
      </div>

      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
        <p style={{ margin: "0 0 2px", fontSize: "12px", color: "#999" }}>{product.desc}</p>
        <h3 style={{ margin: "0 0 10px", fontSize: "14px", fontWeight: 700, color: "#111", lineHeight: 1.4 }}>
          {product.name} <span style={{ fontWeight: 400, color: "#aaa", fontSize: "12px" }}>{product.weight}</span>
        </h3>

        <div style={{ marginBottom: "8px" }}>
          {discount > 0 && cartQty > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "1px" }}>
              <span style={{ color: "#e53935", fontSize: "13px", fontWeight: 800 }}>{discount}%</span>
              <span style={{ fontSize: "12px", color: "#ccc", textDecoration: "line-through" }}>{fmt(product.price)}원</span>
            </div>
          )}
          <span style={{ fontSize: "18px", fontWeight: 800, color: "#111" }}>
            {fmt(discount > 0 && cartQty > 0 ? finalPrice : product.price)}
          </span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#111" }}>원</span>
          <span style={{ fontSize: "11px", color: "#bbb", marginLeft: "3px" }}>/{product.unit}</span>
        </div>

        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "14px" }}>
          {product.bulkPrice.map((bp, i) => (
            <span key={i} style={{
              fontSize: "10px", padding: "2px 7px", borderRadius: "2px",
              background: (cartQty >= bp.qty) ? "#fff3e0" : "#f5f5f5",
              color: (cartQty >= bp.qty) ? "#e65100" : "#bbb",
              fontWeight: (cartQty >= bp.qty) ? 700 : 400,
            }}>{bp.qty}개↑ {bp.discount}%</span>
          ))}
        </div>

        <div style={{ marginTop: "auto" }} />

        {cartQty > 0 ? (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", flex: 1, border: "1px solid #e0e0e0", borderRadius: "4px", overflow: "hidden" }}>
              <button onClick={() => onUpdate(product.id, cartQty - 1)} style={{ width: "34px", height: "36px", border: "none", background: "#fafafa", cursor: "pointer", fontSize: "14px", color: "#666" }}>−</button>
              <span style={{ flex: 1, textAlign: "center", fontSize: "13px", fontWeight: 700, borderLeft: "1px solid #eee", borderRight: "1px solid #eee", lineHeight: "36px", color: "#111" }}>{cartQty}</span>
              <button onClick={() => onUpdate(product.id, Math.min(cartQty + 1, product.stock))} style={{ width: "34px", height: "36px", border: "none", background: "#fafafa", cursor: "pointer", fontSize: "14px", color: "#666" }}>+</button>
            </div>
            <span style={{ fontSize: "13px", fontWeight: 800, color: "#111", whiteSpace: "nowrap" }}>{fmt(finalPrice * cartQty)}원</span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #e0e0e0", borderRadius: "4px", overflow: "hidden" }}>
              <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: "30px", height: "34px", border: "none", background: "#fafafa", cursor: "pointer", fontSize: "13px", color: "#888" }}>−</button>
              <input type="number" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: "36px", textAlign: "center", border: "none", borderLeft: "1px solid #eee", borderRight: "1px solid #eee", fontSize: "12px", fontWeight: 600, outline: "none", height: "34px" }} />
              <button onClick={() => setQty(qty + 1)} style={{ width: "30px", height: "34px", border: "none", background: "#fafafa", cursor: "pointer", fontSize: "13px", color: "#888" }}>+</button>
            </div>
            <button disabled={outOfStock} onClick={() => !outOfStock && onAdd(product.id, qty)} style={{
              flex: 1, height: "34px", border: "none",
              background: outOfStock ? "#f5f5f5" : "#333", color: outOfStock ? "#ccc" : "#fff",
              borderRadius: "4px", fontSize: "13px", fontWeight: 700,
              cursor: outOfStock ? "not-allowed" : "pointer",
            }}>장바구니</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Cart Panel ─── */
function CartPanel({ cart, products, onUpdate, onRemove, onClose, onOrder }: {
  cart: Record<string, number>; products: Product[];
  onUpdate: (id: number, qty: number) => void;
  onRemove: (id: number) => void;
  onClose: () => void; onOrder: () => void;
}) {
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const cartProducts: CartProduct[] = items.map(([id, qty]) => {
    const p = products.find(x => x.id === parseInt(id));
    if (!p) return null;
    const { discount, finalPrice } = getDiscountInfo(p, qty);
    return { ...p, qty, discount, finalPrice, subtotal: finalPrice * qty };
  }).filter(Boolean) as CartProduct[];
  const total = cartProducts.reduce((s, p) => s + p.subtotal, 0);
  const totalQty = cartProducts.reduce((s, p) => s + p.qty, 0);
  const saved = cartProducts.reduce((s, p) => s + (p.price - p.finalPrice) * p.qty, 0);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }} />
      <div style={{
        position: "relative", width: "400px", maxWidth: "100vw",
        background: "#fff", height: "100%", display: "flex", flexDirection: "column",
        boxShadow: "-2px 0 16px rgba(0,0,0,0.06)",
        animation: "slideIn 0.2s ease",
      }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#111" }}>장바구니 <span style={{ fontWeight: 500, color: "#999" }}>({totalQty})</span></h2>
          <button onClick={onClose} style={{ width: "28px", height: "28px", borderRadius: "4px", border: "1px solid #e8e8e8", background: "#fff", cursor: "pointer", fontSize: "12px", color: "#999", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <p style={{ fontSize: "13px", color: "#ccc" }}>장바구니가 비어있습니다</p>
            </div>
          ) : cartProducts.map(p => (
            <div key={p.id} style={{ display: "flex", gap: "10px", padding: "12px 0", borderBottom: "1px solid #f5f5f5", alignItems: "flex-start" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "4px", background: "#f9f9f9", display: "flex", border: "1px solid #f0f0f0", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <ProductImage product={p} size={42} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "2px" }}>{p.name}</div>
                <div style={{ fontSize: "11px", color: "#999", marginBottom: "6px" }}>
                  {fmt(p.finalPrice)}원/{p.unit}
                  {p.discount > 0 && <span style={{ color: "#e53935", fontWeight: 700, marginLeft: "4px" }}>-{p.discount}%</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", border: "1px solid #e8e8e8", borderRadius: "3px", overflow: "hidden" }}>
                    <button onClick={() => onUpdate(p.id, p.qty - 1)} style={{ width: "24px", height: "24px", border: "none", background: "#fafafa", cursor: "pointer", fontSize: "11px", color: "#888" }}>−</button>
                    <span style={{ width: "28px", textAlign: "center", fontSize: "11px", fontWeight: 700, borderLeft: "1px solid #eee", borderRight: "1px solid #eee", lineHeight: "24px" }}>{p.qty}</span>
                    <button onClick={() => onUpdate(p.id, Math.min(p.qty + 1, p.stock))} style={{ width: "24px", height: "24px", border: "none", background: "#fafafa", cursor: "pointer", fontSize: "11px", color: "#888" }}>+</button>
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#111" }}>{fmt(p.subtotal)}원</span>
                </div>
              </div>
              <button onClick={() => onRemove(p.id)} style={{ width: "20px", height: "20px", border: "none", background: "none", color: "#d0d0d0", cursor: "pointer", fontSize: "12px" }}>✕</button>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <div style={{ borderTop: "1px solid #e8e8e8", padding: "14px 20px" }}>
            {saved > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#e53935", marginBottom: "6px", fontWeight: 600 }}>
                <span>할인</span><span>-{fmt(saved)}원</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#666" }}>총 주문금액</span>
              <span style={{ fontSize: "20px", fontWeight: 900, color: "#111" }}>{fmt(total)}원</span>
            </div>
            <button onClick={onOrder} style={{
              width: "100%", height: "46px", border: "none", background: "#333", color: "#fff",
              borderRadius: "6px", fontSize: "14px", fontWeight: 700, cursor: "pointer",
            }}>주문하기</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Order Modal ─── */
function OrderModal({ cart, products, onClose }: {
  cart: Record<string, number>; products: Product[]; onClose: () => void;
}) {
  const [done, setDone] = useState(false);
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const cartProducts: CartProduct[] = items.map(([id, qty]) => {
    const p = products.find(x => x.id === parseInt(id));
    if (!p) return null;
    const { discount, finalPrice } = getDiscountInfo(p, qty);
    return { ...p, qty, discount, finalPrice, subtotal: finalPrice * qty };
  }).filter(Boolean) as CartProduct[];
  const total = cartProducts.reduce((s, p) => s + p.subtotal, 0);

  if (done) return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)" }}>
      <div style={{ background: "#fff", borderRadius: "12px", padding: "44px 36px", textAlign: "center", maxWidth: "360px" }}>
        <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#e8f5e9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: "24px", color: "#4caf50" }}>✓</div>
        <h2 style={{ margin: "0 0 6px", fontSize: "17px", fontWeight: 800, color: "#111" }}>주문이 완료되었습니다</h2>
        <p style={{ color: "#999", fontSize: "13px", margin: "0 0 20px" }}>담당자 확인 후 연락드리겠습니다</p>
        <button onClick={onClose} style={{ padding: "10px 28px", border: "none", background: "#333", color: "#fff", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>확인</button>
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)" }}>
      <div style={{ background: "#fff", borderRadius: "8px", width: "480px", maxWidth: "95vw", maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ padding: "20px 22px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800 }}>주문서 확인</h2>
            <button onClick={onClose} style={{ width: "26px", height: "26px", borderRadius: "4px", border: "1px solid #e8e8e8", background: "#fff", cursor: "pointer", fontSize: "11px", color: "#999" }}>✕</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #111" }}>
                <th style={{ padding: "7px 0", fontWeight: 700, textAlign: "left" }}>상품</th>
                <th style={{ textAlign: "center", fontWeight: 700 }}>단가</th>
                <th style={{ textAlign: "center", fontWeight: 700 }}>수량</th>
                <th style={{ textAlign: "right", fontWeight: 700 }}>금액</th>
              </tr>
            </thead>
            <tbody>
              {cartProducts.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 0" }}><span style={{ fontWeight: 600 }}>{p.name}</span> <span style={{ fontSize: "10px", color: "#aaa" }}>{p.weight}</span></td>
                  <td style={{ textAlign: "center" }}>{fmt(p.finalPrice)}원{p.discount > 0 && <span style={{ color: "#e53935", fontSize: "9px", display: "block" }}>-{p.discount}%</span>}</td>
                  <td style={{ textAlign: "center", fontWeight: 600 }}>{p.qty}{p.unit}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{fmt(p.subtotal)}원</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid #111", marginTop: "4px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>합계</span>
            <span style={{ fontSize: "18px", fontWeight: 900 }}>{fmt(total)}원</span>
          </div>
        </div>
        <div style={{ padding: "0 22px 20px" }}>
          <textarea placeholder="요청사항 (선택)" style={{ width: "100%", height: "50px", border: "1px solid #e0e0e0", borderRadius: "6px", padding: "10px 12px", fontSize: "12px", resize: "none", outline: "none", boxSizing: "border-box", marginBottom: "10px" }} />
          <button onClick={() => setDone(true)} style={{ width: "100%", height: "44px", border: "none", background: "#333", color: "#fff", borderRadius: "6px", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>주문 확정</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Add Product Modal ─── */
function AddProductModal({ categories, onAdd, onClose }: {
  categories: Category[]; onAdd: (p: Product) => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: "", weight: "", price: "", stock: "", unit: "병",
    desc: "", category: categories[0]?.id || "sauce", color: "#c0a060",
    bulk1qty: "10", bulk1disc: "5", bulk2qty: "30", bulk2disc: "10",
  });
  const u = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const ok = form.name && form.weight && form.price && form.stock;

  const submit = () => {
    if (!ok) return;
    const bp: BulkPrice[] = [];
    if (form.bulk1qty && form.bulk1disc) bp.push({ qty: +form.bulk1qty, discount: +form.bulk1disc });
    if (form.bulk2qty && form.bulk2disc) bp.push({ qty: +form.bulk2qty, discount: +form.bulk2disc });
    onAdd({ id: Date.now(), name: form.name, weight: form.weight, price: +form.price, stock: +form.stock, unit: form.unit, desc: form.desc || form.name, category: form.category, color: form.color, bulkPrice: bp });
    onClose();
  };

  const f: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: "4px", border: "1px solid #ddd", fontSize: "13px", outline: "none", boxSizing: "border-box" };
  const l: React.CSSProperties = { fontSize: "11px", fontWeight: 600, color: "#888", display: "block", marginBottom: "3px" };
  const COLORS = ["#f5e6d0","#2d1a0e","#1a0f08","#8b0000","#c0a060","#2e5339","#1a3a5c","#4a2c2a","#333","#d4a574","#e8c8a0","#556b2f"];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "8px", width: "500px", maxWidth: "95vw", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#111" }}>상품 추가</h3>
          <button onClick={onClose} style={{ width: "26px", height: "26px", borderRadius: "4px", border: "1px solid #e8e8e8", background: "#fff", cursor: "pointer", fontSize: "11px", color: "#999" }}>✕</button>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Preview */}
          <div style={{ background: "#fafafa", borderRadius: "6px", padding: "14px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #f0f0f0" }}>
            <ProductImage product={{ name: form.name || "상품명", weight: form.weight || "000g", unit: form.unit, color: form.color }} size={110} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div><label style={l}>상품명 *</label><input value={form.name} onChange={e => u("name", e.target.value)} placeholder="예: 백설 설탕" style={f} /></div>
            <div><label style={l}>용량 *</label><input value={form.weight} onChange={e => u("weight", e.target.value)} placeholder="예: 1kg" style={f} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: "10px" }}>
            <div><label style={l}>가격 (원) *</label><input type="number" value={form.price} onChange={e => u("price", e.target.value)} placeholder="0" style={f} /></div>
            <div><label style={l}>재고 *</label><input type="number" value={form.stock} onChange={e => u("stock", e.target.value)} placeholder="0" style={f} /></div>
            <div><label style={l}>단위</label><select value={form.unit} onChange={e => u("unit", e.target.value)} style={{ ...f, cursor: "pointer" }}>
              {["병","봉","팩","통","캔","단","망","박스"].map(v => <option key={v} value={v}>{v}</option>)}
            </select></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "10px" }}>
            <div><label style={l}>카테고리</label><select value={form.category} onChange={e => u("category", e.target.value)} style={{ ...f, cursor: "pointer" }}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
            <div><label style={l}>상세 설명</label><input value={form.desc} onChange={e => u("desc", e.target.value)} placeholder="선택 입력" style={f} /></div>
          </div>
          <div>
            <label style={l}>패키지 색상</label>
            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
              {COLORS.map(c => <div key={c} onClick={() => u("color", c)} style={{ width: "26px", height: "26px", borderRadius: "4px", background: c, cursor: "pointer", border: form.color === c ? "2px solid #111" : "1px solid #e0e0e0" }} />)}
            </div>
          </div>
          <div>
            <label style={l}>대량 할인</label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {([["bulk1qty","bulk1disc"],["bulk2qty","bulk2disc"]] as const).map(([qk,dk], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "12px", color: "#666" }}>
                  <input type="number" value={form[qk]} onChange={e => u(qk, e.target.value)} style={{ ...f, width: "55px", padding: "5px 7px" }} /><span>개↑</span>
                  <input type="number" value={form[dk]} onChange={e => u(dk, e.target.value)} style={{ ...f, width: "45px", padding: "5px 7px" }} /><span>%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "0 22px 18px" }}>
          <button onClick={submit} disabled={!ok} style={{
            width: "100%", height: "44px", border: "none",
            background: ok ? "#333" : "#e8e8e8", color: ok ? "#fff" : "#bbb",
            borderRadius: "6px", fontSize: "14px", fontWeight: 700, cursor: ok ? "pointer" : "not-allowed",
          }}>상품 등록</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Add Category Modal ─── */
function AddCategoryModal({ onAdd, onClose, existingNames }: {
  onAdd: (c: Category) => void; onClose: () => void; existingNames: string[];
}) {
  const [name, setName] = useState("");
  const dup = existingNames.includes(name.trim());
  const ok = name.trim().length > 0 && !dup;
  const submit = () => { if (!ok) return; onAdd({ id: "cat_" + Date.now(), name: name.trim() }); onClose(); };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "8px", padding: "22px", width: "340px", maxWidth: "92vw" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: "15px", fontWeight: 800, color: "#111" }}>카테고리 추가</h3>
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="카테고리 이름" autoFocus
          style={{ width: "100%", padding: "10px 12px", borderRadius: "4px", border: dup ? "1.5px solid #e53935" : "1px solid #ddd", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
        {dup && <p style={{ fontSize: "11px", color: "#e53935", margin: "4px 0 0", fontWeight: 600 }}>이미 존재합니다</p>}
        <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
          <button onClick={onClose} style={{ flex: 1, height: "38px", border: "1px solid #ddd", background: "#fff", borderRadius: "4px", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#666" }}>취소</button>
          <button onClick={submit} disabled={!ok} style={{ flex: 1, height: "38px", border: "none", background: ok ? "#333" : "#e8e8e8", color: ok ? "#fff" : "#bbb", borderRadius: "4px", fontSize: "13px", fontWeight: 700, cursor: ok ? "pointer" : "not-allowed" }}>추가</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
export function OnISShop() {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCart, setShowCart] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [sortBy, setSortBy] = useState("default");

  const allCats = useMemo(() => [{ id: "all", name: "전체" }, ...categories], [categories]);
  const cartCount = Object.values(cart).reduce((s, q) => s + (q > 0 ? 1 : 0), 0);

  const filtered = useMemo(() => {
    let list = products;
    if (category !== "all") list = list.filter(p => p.category === category);
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    if (sortBy === "price-asc") list = [...list].sort((a, b) => a.price - b.price);
    if (sortBy === "price-desc") list = [...list].sort((a, b) => b.price - a.price);
    if (sortBy === "stock") list = [...list].sort((a, b) => b.stock - a.stock);
    return list;
  }, [products, category, search, sortBy]);

  const addToCart = (id: number, qty: number) => setCart(p => ({ ...p, [id]: (p[id] || 0) + qty }));
  const updateCart = (id: number, qty: number) => setCart(p => { const n = { ...p }; if (qty <= 0) delete n[id]; else n[id] = qty; return n; });
  const removeFromCart = (id: number) => setCart(p => { const n = { ...p }; delete n[id]; return n; });

  return (
    <div style={{ fontFamily: "'Noto Sans KR',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Shop Header */}
      <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e8e8e8", padding: "12px 20px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 900 }}>
            <span style={{ color: "#e53935" }}>OnIS</span> <span style={{ color: "#111" }}>Shop</span>
            <span style={{ fontSize: "9px", fontWeight: 700, color: "#fff", background: "#111", padding: "2px 5px", borderRadius: "2px", marginLeft: "6px", verticalAlign: "middle" }}>도매</span>
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", background: "#f5f5f5", borderRadius: "6px", padding: "0 10px", height: "34px", width: "200px", border: "1px solid #eee" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px", flexShrink: 0 }}><circle cx="10.5" cy="10.5" r="7"/><line x1="15.5" y1="15.5" x2="21" y2="21"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="상품 검색" style={{ border: "none", background: "transparent", outline: "none", fontSize: "12px", width: "100%", color: "#333" }} />
          </div>
          <button onClick={() => setShowCart(true)} style={{
            display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px", borderRadius: "6px",
            border: cartCount > 0 ? "1.5px solid #111" : "1px solid #ddd",
            background: cartCount > 0 ? "#111" : "#fff", color: cartCount > 0 ? "#fff" : "#888",
            cursor: "pointer", fontSize: "12px", fontWeight: 600,
          }}>
            장바구니{cartCount > 0 && <span style={{ background: "#e53935", color: "#fff", padding: "1px 6px", borderRadius: "8px", fontSize: "10px", fontWeight: 800 }}>{cartCount}</span>}
          </button>
        </div>
      </div>

      {/* Category Bar */}
      <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e8e8e8", padding: "8px 20px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {allCats.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)} style={{
              padding: "5px 14px", borderRadius: "4px",
              border: category === c.id ? "1.5px solid #111" : "1px solid #e0e0e0",
              background: category === c.id ? "#111" : "#fff",
              color: category === c.id ? "#fff" : "#666",
              fontSize: "12px", fontWeight: category === c.id ? 700 : 500, cursor: "pointer",
            }}>{c.name}</button>
          ))}
          <button onClick={() => setShowAddCategory(true)} style={{ padding: "5px 10px", borderRadius: "4px", border: "1.5px dashed #ccc", background: "transparent", color: "#bbb", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>+</button>
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "5px 8px", borderRadius: "4px", border: "1px solid #ddd", fontSize: "11px", color: "#888", outline: "none", cursor: "pointer" }}>
          <option value="default">기본 정렬</option>
          <option value="price-asc">낮은가격순</option>
          <option value="price-desc">높은가격순</option>
          <option value="stock">재고순</option>
        </select>
      </div>

      {/* Grid */}
      <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ margin: 0, fontSize: "12px", color: "#999" }}>총 {filtered.length}개</p>
        <button onClick={() => setShowAddProduct(true)} style={{
          padding: "7px 14px", borderRadius: "4px", border: "1px solid #ddd", background: "#fff",
          color: "#333", fontSize: "12px", fontWeight: 600, cursor: "pointer",
        }}>+ 상품 추가</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "14px" }}>
        {filtered.map(p => <ProductCard key={p.id} product={p} cartQty={cart[p.id] || 0} onAdd={addToCart} onUpdate={updateCart} />)}
      </div>
      {filtered.length === 0 && <div style={{ textAlign: "center", padding: "80px 0" }}><p style={{ fontSize: "13px", color: "#ccc" }}>검색 결과가 없습니다</p></div>}

      {showCart && <CartPanel cart={cart} products={products} onUpdate={updateCart} onRemove={removeFromCart} onClose={() => setShowCart(false)} onOrder={() => { setShowCart(false); setShowOrder(true); }} />}
      {showOrder && <OrderModal cart={cart} products={products} onClose={() => { setShowOrder(false); setCart({}); }} />}
      {showAddProduct && <AddProductModal categories={categories} onAdd={(p: Product) => setProducts(prev => [...prev, p])} onClose={() => setShowAddProduct(false)} />}
      {showAddCategory && <AddCategoryModal onAdd={(c: Category) => setCategories(prev => [...prev, c])} onClose={() => setShowAddCategory(false)} existingNames={categories.map(c => c.name)} />}
    </div>
  );
}

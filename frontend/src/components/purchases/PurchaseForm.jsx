import ReceiptInfo from "./ReceiptInfo";
import ProductSearch from "./ProductSearch";

export default function PurchaseForm({ state }) {
    return (
        <div className="space-y-4">
            <ReceiptInfo state={state} />
            <ProductSearch state={state} />
        </div>
    );
}

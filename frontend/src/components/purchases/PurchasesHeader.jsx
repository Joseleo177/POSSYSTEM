import { Button } from "../ui/Button";

export default function PurchasesHeader({ openNew }) {
    return (
        <Button onClick={openNew}>
            + Nuevo Recibo
        </Button>
    );
}

// src/Layout/MainContent.jsx
import React from "react";
import { PAGE_COMPONENTS } from "../constants/pages";

export default function MainContent({ safeTab }) {
    const Page = PAGE_COMPONENTS[safeTab] || PAGE_COMPONENTS["Dashboard"];
    return (
        <main className="flex-1 min-h-0 w-full h-full overflow-hidden">
            <Page />
        </main>
    );
}

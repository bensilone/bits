import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Winners } from "./pages/Winners";
import { Fairness } from "./pages/Fairness";
import { Announcements } from "./pages/Announcements";
import { About } from "./pages/About";
import { Download } from "./pages/Download";
import { Wallet } from "./pages/Wallet";
import { Referral } from "./pages/Referral";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/winners" element={<Winners />} />
        <Route path="/fairness" element={<Fairness />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/about" element={<About />} />
        <Route path="/faq" element={<About />} />
        <Route path="/download" element={<Download />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/r/:code" element={<Referral />} />
      </Routes>
    </Layout>
  );
}

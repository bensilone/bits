import { Link, NavLink } from "react-router-dom";
import type { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="container">
        <nav className="nav">
          <Link to="/" className="nav-brand">
            win<span>bitcoin</span>.app
          </Link>
          <div className="nav-links">
            <NavLink to="/winners">Winners</NavLink>
            <NavLink to="/fairness">Fairness</NavLink>
            <NavLink to="/announcements">News</NavLink>
            <NavLink to="/wallet">Wallet</NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/download">Download</NavLink>
          </div>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="footer container">
        <p>
          Sparks · Public site lean: winbitcoin.app · Idle compute → entries → prizes.
          Not income. Costs electricity.{" "}
          <a href="https://github.com/bensilone/sparks">Source</a>
        </p>
      </footer>
    </>
  );
}

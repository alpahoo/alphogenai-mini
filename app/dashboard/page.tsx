import { redirect } from "next/navigation";

export const metadata = {
  title: "Dashboard - Alpho Gen AI",
  description: "Create stunning videos, images, and more with AI-powered tools",
};

export default function DashboardPage() {
  // V1: UI minimale — le flow canonique est /generate.
  // On garde /dashboard pour compat, mais on redirige.
  redirect("/generate");
}

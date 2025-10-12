import Footer from "../(components)/Footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Landing: no Header, only Footer
  return (
    <>
      {children}
      <Footer />
    </>
  );
}

// The page itself runs in the browser, so its title lives here.
export const metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

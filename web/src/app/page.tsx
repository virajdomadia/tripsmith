import { Header } from '@/components/landing/Header';
import { Hero } from '@/components/landing/Hero';
import { Trips } from '@/components/landing/Trips';
import { How } from '@/components/landing/How';
import { Agency } from '@/components/landing/Agency';
import { Cta } from '@/components/landing/Cta';
import { Footer } from '@/components/landing/Footer';

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Trips />
        <How />
        <Agency />
        <Cta />
      </main>
      <Footer />
    </>
  );
}

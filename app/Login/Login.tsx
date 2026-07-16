import Image from 'next/image';
import Link from 'next/link';

export default function Login() {
  return (
    <div style={{ 
      display: 'flex', 
      flexWrap: 'wrap-reverse', // Ensures images go on top on mobile, side-by-side on desktop
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh', 
      fontFamily: 'sans-serif',
      backgroundColor: '#ffffff', // Clean white background
      color: '#111827',
      padding: '5%'
    }}>

      {/* Left Column: Headlines and Button */}
      <div style={{ flex: '1 1 450px', maxWidth: '600px', padding: '20px' }}>
        
        {/* Main Headlines - Unbolded and forced to single lines */}
        <h1 style={{ 
          fontSize: 'clamp(3rem, 5vw, 4.5rem)', // Scales nicely on smaller screens
          lineHeight: '1.2', 
          fontWeight: 'normal', // Unbolded
          margin: '0 0 40px 0',
          letterSpacing: '-1px',
          whiteSpace: 'nowrap' // Ensures the text stays on one line
        }}>
          <div style={{ color: '#171717' }}>Log Workouts</div>
          <div style={{ color: '#2563eb' }}>Get Stronger</div>
          <div style={{ color: '#171717' }}>Stay Motivated</div>
        </h1>

        {/* Login Button - Wrapped in Link for Navigation to /templates */}
        <Link href="/templates" style={{ textDecoration: 'none' }}>
          <button style={{ 
            backgroundColor: '#3b82f6', // Brighter blue
            color: 'white', 
            padding: '20px 60px', // Much larger padding
            border: 'none', 
            borderRadius: '16px', 
            fontSize: '1.4rem', // Larger font size
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(59, 130, 246, 0.4)', // Brighter, larger shadow
            transition: 'transform 0.2s'
          }}>
            Log In
          </button>
        </Link>
      </div>

      {/* Right Column: Theme Image */}
      <div style={{ flex: '1 1 450px', display: 'flex', justifyContent: 'center', padding: '20px' }}>
        <Image 
          src="/theme_img.png" // Updated to pull directly from the public folder
          alt="App Preview" 
          width={600} // Next.js requires width for public images
          height={600} // Next.js requires height for public images
          style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain' }}
          priority // Tells Next.js to load this main image quickly
        />
      </div>

    </div>
  );
}
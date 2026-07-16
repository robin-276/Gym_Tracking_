// app/page.tsx

// 1. Import your Login component from the Login folder
import Login from './Login/Login'; 

export default function Home() {
  return (
    <main>
      {/* 2. Tell the main page to display the Login component */}
      <Login />
    </main>
  );
}
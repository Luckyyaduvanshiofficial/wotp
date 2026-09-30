import Link from 'next/link';
import { Icons } from '@/components/icons';
import { ThemeToggle } from '@/features/landing/components/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className='lm lm-auth'>
      <div className='lm-blueprint' aria-hidden='true' />
      <div className='lm-auth__frame'>
        <div className='lm-auth__top'>
          <Link href='/' className='lm-auth__brand'>
            <Icons.logo className='size-4' aria-hidden='true' />
            wotp
          </Link>
          <ThemeToggle />
        </div>
        {children}
      </div>
    </div>
  );
}

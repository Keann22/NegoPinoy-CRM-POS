'use client';

import Link from 'next/link';
import {
  Archive,
  ArrowDownUp,
  AlertTriangle,
  Bell,
  BookCopy,
  Building,
  ChevronDown,
  Home,
  CreditCard,
  LineChart,
  ListChecks,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  PackageCheck,
  Repeat,
  Upload,
  Bot,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  History,
  PhilippinePeso,
  FileText,
  ClipboardList,
  ShieldCheck,
  CalendarCheck2,
  Undo2,
  Printer,
} from 'lucide-react';
import { useAuth, useUser } from '@/lib/supabase/hooks';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DueDateAlert } from '@/components/dashboard/due-date-alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Logo } from '@/components/logo';
import { useUserProfile } from '@/hooks/useUserProfile';
import { NotificationBell } from '@/components/dashboard/notification-bell';
import { InboxDrawer } from '@/components/dashboard/inbox-drawer';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { userProfile } = useUserProfile();
  const router = useRouter();
  const pathname = usePathname();

  const [openInventory, setOpenInventory] = useState(false);
  const [openAccounting, setOpenAccounting] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const roles = useMemo(() => userProfile?.roles || [], [userProfile]);
  
  const isManagement = useMemo(() => roles.some(r => ['owner', 'admin'].includes(String(r).toLowerCase())), [roles]);
  const isSales = useMemo(() => roles.some(r => String(r).toLowerCase() === 'sales'), [roles]);
  const isInventory = useMemo(() => roles.some(r => String(r).toLowerCase() === 'inventory'), [roles]);

  const navLinks = useMemo(() => {
    const links = [];

    // Dashboard for Sales, Management, or Inventory
    if (isManagement || isSales || isInventory) {
      links.push({ href: '/dashboard', label: 'Dashboard', icon: Home });
    }

    links.push({ href: '/dashboard/orders', label: 'Orders', icon: ShoppingCart });
    
    if (isManagement || isSales || isInventory) {
      links.push({ href: '/dashboard/packed-orders', label: 'Packed Orders', icon: PackageCheck });
      links.push({ href: '/dashboard/for-shipping', label: 'For Shipping', icon: Truck });
      links.push({ href: '/dashboard/for-pick-up', label: 'For Pick-up', icon: PackageCheck });
    }

    links.push({ href: '/dashboard/products', label: 'Products', icon: Package });
    links.push({ href: '/dashboard/pick', label: 'Picker App', icon: ClipboardList });
    links.push({ href: '/dashboard/verify', label: 'Second Check', icon: ShieldCheck });
    links.push({ href: '/dashboard/pack', label: 'Packer App', icon: Package });
    
    if (isManagement || isInventory) {
      links.push({ href: '/dashboard/categories', label: 'Categories', icon: ListChecks });
    }

    if (isManagement || isInventory) {
      const inventorySubItems = [
        { href: '/dashboard/inventory/procurement-request', label: 'Procurement Request', icon: ListChecks },
        { href: '/dashboard/inventory/print-list', label: 'Print Inventory List', icon: Printer },
        { href: '/dashboard/inventory/audit', label: 'Out of Stock Audit', icon: ListChecks },
        { href: '/dashboard/inventory/receive', label: 'Bulk Receive', icon: Truck },
        { href: '/dashboard/inventory/restock', label: 'Restock / Purchase', icon: ArrowDownUp },
        { href: '/dashboard/inventory/batches', label: 'Stock Batch List', icon: ListChecks },
        { href: '/dashboard/inventory/movements', label: 'Inventory History', icon: History },
        { href: '/dashboard/inventory/returns', label: 'Returns', icon: Undo2 }
      ];

      if (isManagement) {
        inventorySubItems.unshift({ href: '/dashboard/reports/procurement', label: 'Procurement Sheet', icon: ListChecks });
        inventorySubItems.unshift({ href: '/dashboard/inventory/scan-receipt', label: 'Upload Receipt', icon: Upload });
        inventorySubItems.push({ href: '/dashboard/inventory/pending-costs', label: 'Encode Costs', icon: PhilippinePeso });
      }

      links.push({
        id: 'inventory',
        label: 'Inventory Management',
        icon: Archive,
        isOpen: openInventory,
        setIsOpen: setOpenInventory,
        subItems: inventorySubItems
      });
    }

    if (isManagement) {
      links.push({
        id: 'accounting',
        label: 'Accounting',
        icon: BookCopy,
        isOpen: openAccounting,
        setIsOpen: setOpenAccounting,
        subItems: [
          { href: '/dashboard/accounting/payments', label: 'Payments', icon: CreditCard },
          { href: '/dashboard/accounting/unpaid-shipped', label: 'Unpaid Shipped Orders', icon: AlertTriangle },
          { href: '/dashboard/accounting/remittances', label: 'SPX Remittances', icon: FileText },
          { href: '/dashboard/accounting/expenses', label: 'Expenses', icon: Wallet },
          { href: '/dashboard/accounting/recurring', label: 'Recurring', icon: Repeat },
        ]
      });
      links.push({ href: '/dashboard/customers', label: 'Customers', icon: Users });
      links.push({ href: '/dashboard/suppliers', label: 'Suppliers', icon: Building });
      links.push({ href: '/dashboard/users', label: 'User Management', icon: Users });
      
      // New AI/Admin Features
      links.push({ href: '/dashboard/approval-queue', label: 'AI Approval Queue', icon: ListChecks });
      links.push({ href: '/dashboard/simulator', label: 'AI Simulator', icon: Bot });
      links.push({ href: '/dashboard/chat', label: 'Chat History', icon: MessageCircle });
    } else if (isSales) {
      links.push({ href: '/dashboard/customers', label: 'Customers', icon: Users });
    }

    links.push({ href: '/dashboard/reports', label: 'Reports', icon: LineChart });

    // Daily Log — visible to Sales and Management
    if (isManagement || isSales) {
      links.push({ href: '/dashboard/daily-log', label: 'Daily Task Log', icon: CalendarCheck2 });
    }

    return links;
  }, [isManagement, isSales, isInventory, openInventory, openAccounting]);

  useEffect(() => {
    if (pathname.startsWith('/dashboard/inventory')) {
      setOpenInventory(true);
    }
    if (pathname.startsWith('/dashboard/accounting')) {
      setOpenAccounting(true);
    }
    
    // Close mobile menu on navigation
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isUserLoading && !user) {
      // Sign out to clear any stale session in localStorage that getSession might falsely read
      auth.signOut().finally(() => {
        router.push('/');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isUserLoading, router]);

  const handleLogout = () => {
    auth.signOut();
  };

  if (isUserLoading || !user) {
    return <div className="flex items-center justify-center min-h-screen bg-background">Loading...</div>
  }

  const renderNavLinks = (isMobile = false) => {
    return navLinks.map((link) => {
      const Icon = link.icon;

      if ('subItems' in link && link.subItems) {
        const isParentActive = pathname.startsWith(`/dashboard/${link.id}`);
        return (
          <Collapsible key={link.id} open={link.isOpen} onOpenChange={link.setIsOpen}>
            <CollapsibleTrigger
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                isParentActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
                isMobile && 'mx-[-0.65rem] gap-4 rounded-xl'
              )}
            >
              <Icon className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />
              {link.label}
              <ChevronDown className={cn(
                "ml-auto h-4 w-4 transition-transform",
                link.isOpen && "rotate-180"
              )} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-7 pt-2 space-y-1">
              {link.subItems.map(subLink => {
                const SubIcon = subLink.icon;
                const isSubActive = pathname === subLink.href;
                return (
                  <Link
                    key={subLink.href}
                    href={subLink.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      isSubActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
                    )}
                  >
                    <SubIcon className="h-4 w-4" />
                    {subLink.label}
                  </Link>
                )
              })}
            </CollapsibleContent>
          </Collapsible>
        )
      }

      const isActive = pathname === link.href;
      return (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all',
            isActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            isMobile && 'mx-[-0.65rem] gap-4 rounded-xl'
          )}
        >
          <Icon className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />
          {link.label}
        </Link>
      );
    });
  }

  return (
    <>
      <DueDateAlert />
      <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr] print:block">
        <div className="hidden border-r bg-sidebar md:block print:hidden">
          <div className="flex h-full max-h-screen flex-col gap-2">
            <div className="flex h-14 items-center border-b border-sidebar-border px-4 lg:h-[60px] lg:px-6">
              <Link href="/" className="flex items-center gap-2 font-semibold text-sidebar-foreground">
                <Logo className="h-6 w-6" />
                <span className="font-headline">NegosyantengPinoy.Ph</span>
              </Link>
              <div className="ml-auto flex items-center">
                <InboxDrawer />
                <NotificationBell />
              </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <nav className="grid items-start px-2 text-sm font-medium lg:px-4 pb-4">
              {renderNavLinks()}
            </nav>
          </div>
        </div>
      </div>
      <div className="flex flex-col print:block">
        <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6 print:hidden">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 md:hidden"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col bg-sidebar text-sidebar-foreground border-sidebar-border w-80 sm:w-96 p-0 overflow-y-auto">
              <div className="flex h-14 items-center border-b border-sidebar-border px-4 mb-4 mt-4 shrink-0">
                <Link
                  href="#"
                  className="flex items-center gap-2 text-lg font-semibold text-sidebar-foreground"
                >
                  <Logo className="h-6 w-6" />
                  <span className="font-headline">NegosyantengPinoy.Ph</span>
                </Link>
              </div>
              <nav className="grid gap-2 text-lg font-medium px-4 pb-32">
                {renderNavLinks(true)}
              </nav>
            </SheetContent>
          </Sheet>
          <div className="w-full flex-1">
          </div>
          <div className="flex items-center gap-2 md:hidden mr-2">
            <InboxDrawer />
            <NotificationBell />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="rounded-full">
                <Avatar>
                  {user.photoURL ? (
                    <AvatarImage src={user.photoURL} alt="User avatar" />
                  ) : (
                    <AvatarFallback>
                      {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span className="sr-only">Toggle user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-background print:block print:p-0">
          {children}
        </main>
      </div>
    </div>
    </>
  );
}

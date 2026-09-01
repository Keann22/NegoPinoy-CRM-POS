'use client';

import { startOfToday, startOfYesterday } from 'date-fns';
import { Search, ShoppingBag, DollarSign, Award, Layers } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ReportDateFilter } from '@/components/dashboard/reports/report-date-filter';
import { useSalesByProductReport, type ProductSortOption } from '@/hooks/useSalesByProductReport';

export function SalesByProductReport() {
  const {
    date,
    setDate,
    setDatePreset,
    searchTerm,
    setSearchTerm,
    sortBy,
    setSortBy,
    isLoading,
    filteredProductSales,
    summary,
  } = useSalesByProductReport();

  const isToday = date?.from?.toDateString() === startOfToday().toDateString() &&
    date?.to?.toDateString() === startOfToday().toDateString();
  const isYesterday = date?.from?.toDateString() === startOfYesterday().toDateString() &&
    date?.to?.toDateString() === startOfYesterday().toDateString();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="font-headline">Sales by Product</CardTitle>
              <CardDescription>
                Detailed breakdown of product sales, quantity moved, and revenue generated within the selected period.
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              variant={isToday ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDatePreset('today')}
            >
              Today
            </Button>
            <Button
              variant={isYesterday ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDatePreset('yesterday')}
            >
              Yesterday
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDatePreset('this-month')}
            >
              This Month
            </Button>
            <ReportDateFilter date={date} setDate={setDate} className="mb-0" />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-primary/5 border-primary/20 p-4">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-xs font-medium">Total Units Sold</span>
                <ShoppingBag className="h-4 w-4 text-primary" />
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-20 mt-1" />
              ) : (
                <div className="text-2xl font-bold font-headline text-primary">
                  {summary.totalUnits.toLocaleString()} pcs
                </div>
              )}
            </Card>

            <Card className="bg-secondary/20 border-secondary/30 p-4">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-xs font-medium">Total Product Revenue</span>
                <DollarSign className="h-4 w-4 text-secondary-foreground" />
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-28 mt-1" />
              ) : (
                <div className="text-2xl font-bold font-headline text-secondary-foreground">
                  ₱{summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </Card>

            <Card className="border p-4">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-xs font-medium">Distinct Products</span>
                <Layers className="h-4 w-4 text-muted-foreground" />
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-16 mt-1" />
              ) : (
                <div className="text-2xl font-bold font-headline">
                  {summary.distinctProducts.toLocaleString()}
                </div>
              )}
            </Card>

            <Card className="border p-4">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-xs font-medium">Top Product</span>
                <Award className="h-4 w-4 text-amber-500" />
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-36 mt-1" />
              ) : (
                <div className="text-sm font-semibold truncate mt-1 text-foreground" title={summary.topProduct || 'None'}>
                  {summary.topProduct || 'No sales'}
                </div>
              )}
            </Card>
          </div>

          {/* Controls: Search and Sort */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sort by:</span>
              <Select value={sortBy} onValueChange={(val: ProductSortOption) => setSortBy(val)}>
                <SelectTrigger className="w-[190px] h-9">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qty-desc">Qty Sold (High to Low)</SelectItem>
                  <SelectItem value="qty-asc">Qty Sold (Low to High)</SelectItem>
                  <SelectItem value="revenue-desc">Revenue (High to Low)</SelectItem>
                  <SelectItem value="revenue-asc">Revenue (Low to High)</SelectItem>
                  <SelectItem value="name-asc">Product Name (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Avg Unit Price</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">% of Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-10 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredProductSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      {searchTerm ? 'No products match your search.' : 'No product sales recorded in the selected period.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProductSales.map((p, index) => (
                    <TableRow key={p.productId || index}>
                      <TableCell className="text-center text-xs text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-center text-muted-foreground text-sm">{p.ordersCount}</TableCell>
                      <TableCell className="text-right font-semibold">{p.qty.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        ₱{p.avgPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        ₱{p.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {p.percentageOfTotalRevenue.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {!isLoading && filteredProductSales.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-bold">Total</TableCell>
                    <TableCell className="text-right font-bold">{summary.totalUnits.toLocaleString()} pcs</TableCell>
                    <TableCell className="text-right font-medium text-muted-foreground">
                      ₱{(summary.totalUnits > 0 ? summary.totalRevenue / summary.totalUnits : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      ₱{summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-bold">100.0%</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
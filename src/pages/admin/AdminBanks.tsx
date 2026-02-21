import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  UserCog,
} from "lucide-react";
import { banks, loanSchemes, formatLKR } from "@/data/mockData";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";

export default function AdminBanks() {
  const [openSchemeModal, setOpenSchemeModal] = useState(false);
  const [search, setSearch] = useState("");

  const filteredSchemes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return loanSchemes;
    return loanSchemes.filter(
      (scheme) =>
        scheme.bankName.toLowerCase().includes(term) ||
        scheme.schemeName.toLowerCase().includes(term),
    );
  }, [search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banks and Loan Schemes"
        subtitle="Manage lender profiles, scheme terms, underwriting visibility, and user access."
        actions={(
          <Button onClick={() => setOpenSchemeModal(true)}>
            <Plus className="h-4 w-4" />
            Add Scheme
          </Button>
        )}
      />

      <Dialog open={openSchemeModal} onOpenChange={setOpenSchemeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add or Edit Loan Scheme</DialogTitle>
            <DialogDescription>
              Configure rate bands, amount limits, tenure, and collateral requirements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input placeholder="e.g., Bank of Ceylon" />
              </div>
              <div className="space-y-2">
                <Label>Scheme Name</Label>
                <Input placeholder="e.g., BOC SME Plus" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Minimum Amount (LKR)</Label>
                <Input type="number" placeholder="500000" />
              </div>
              <div className="space-y-2">
                <Label>Maximum Amount (LKR)</Label>
                <Input type="number" placeholder="25000000" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Interest Range (%)</Label>
                <Input placeholder="12.5 - 16" />
              </div>
              <div className="space-y-2">
                <Label>Tenure Range (months)</Label>
                <Input placeholder="12 - 60" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Collateral Required</p>
                <p className="text-xs text-muted-foreground">Enable if this scheme needs security documents.</p>
              </div>
              <Switch />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSchemeModal(false)}>Cancel</Button>
            <Button>Save Scheme</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Registered Banks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {banks.map((bank) => (
              <div key={bank.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 text-lg">
                  {bank.logo}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{bank.name}</p>
                  <p className="text-xs text-muted-foreground">{bank.shortName}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="data-table-wrap">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Loan Schemes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Search, filter, and manage live lending products.</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by bank or scheme"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Button variant="outline" size="icon">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank</TableHead>
                <TableHead>Scheme</TableHead>
                <TableHead>Amount Range</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Tenure</TableHead>
                <TableHead>Collateral</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSchemes.map((scheme) => (
                <TableRow key={scheme.id}>
                  <TableCell className="font-medium">{scheme.bankName}</TableCell>
                  <TableCell>{scheme.schemeName}</TableCell>
                  <TableCell className="text-muted-foreground">{formatLKR(scheme.minAmount)} - {formatLKR(scheme.maxAmount)}</TableCell>
                  <TableCell>{scheme.interestRateMin}% - {scheme.interestRateMax}%</TableCell>
                  <TableCell>{scheme.tenureMin} - {scheme.tenureMax} mo</TableCell>
                  <TableCell>
                    <StatusBadge status={scheme.collateralRequired ? "needs review" : "valid"} />
                  </TableCell>
                  <TableCell>
                    <Switch defaultChecked />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setOpenSchemeModal(true)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="data-table-wrap">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Users</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Control access and monitor account activity.</p>
          </div>
          <Button variant="outline">
            <UserCog className="h-4 w-4" />
            Manage Roles
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Applications</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { name: "Kamal Perera", email: "kamal@example.com", role: "User", apps: 3, joined: "Dec 1, 2024", active: true },
                { name: "Nimal Silva", email: "nimal@example.com", role: "User", apps: 1, joined: "Dec 5, 2024", active: true },
                { name: "Admin User", email: "admin@lankaloan.lk", role: "Admin", apps: 0, joined: "Nov 15, 2024", active: false },
              ].map((user) => (
                <TableRow key={user.email}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "Admin" ? "default" : "secondary"}>{user.role}</Badge>
                  </TableCell>
                  <TableCell>{user.apps}</TableCell>
                  <TableCell>
                    <StatusBadge status={user.active ? "active" : "inactive"} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.joined}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

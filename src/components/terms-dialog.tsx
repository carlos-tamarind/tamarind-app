import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Plain-language terms shown from the signup form. Kept short on purpose: the
 * only data collected at this point is a name and an email address.
 */
export function TermsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Terms &amp; Conditions</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            By requesting access to Tamarind you agree that the name and email address you provide
            are collected and processed solely to create, secure, and administer your Tamarind
            account and workspace.
          </p>
          <p>
            This information is not sold, rented, or shared with third parties, and is not used for
            any purpose outside operating the service — including no marketing use without your
            separate, explicit consent. Data is retained only for as long as your account remains
            active.
          </p>
          <p>
            You may request access to, correction of, or deletion of your data at any time by
            contacting us, and your account and its data will be removed within a reasonable period.
          </p>
          <p>
            Tamarind is currently offered as an early-access product and is provided on an
            as-available basis while the service is under active development.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

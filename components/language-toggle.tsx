import { Languages } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSwitchLocaleNav } from "@/lib/i18n/marketing-href"

export function LanguageToggle() {
  const switchLocale = useSwitchLocaleNav()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Languages className="h-4 w-4" />
          <span className="sr-only">Toggle language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => switchLocale('zh')}>
          中文
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => switchLocale('en')}>
          English
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => switchLocale('ja')}>
          日本語
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => switchLocale('es')}>
          Español
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 
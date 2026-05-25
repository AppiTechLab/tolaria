import { Children, isValidElement, memo, useMemo, useCallback, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { preprocessWikilinks, WIKILINK_SCHEME } from '../utils/chatWikilinks'
import { supportsModernRegexFeatures } from '../utils/regexCapabilities'
import { getTagStyle } from '../utils/tagStyles'
import { INLINE_TAG_SCHEME, preprocessInlineTags } from '../utils/inlineTags'
import { TasksQueryBlock } from './TasksQueryBlock'

const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS = supportsModernRegexFeatures() ? [rehypeHighlight] : []

function markdownUrlTransform(url: string): string {
  if (url.startsWith(WIKILINK_SCHEME) || url.startsWith(INLINE_TAG_SCHEME)) return url
  return defaultUrlTransform(url)
}

interface MarkdownContentProps {
  content: string
  onWikilinkClick?: (target: string) => void
  renderTaskBlocks?: boolean
}

function readCodeLanguage(className: unknown): string | null {
  if (typeof className !== 'string') return null

  const token = className
    .split(/\s+/u)
    .find(candidate => candidate.startsWith('language-'))

  return token ? token.slice('language-'.length).toLowerCase() : null
}

function readReactText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(readReactText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return readReactText(node.props.children)
  return ''
}

function normalizeFenceBody(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}

function readTasksQuery(children: ReactNode): string | null {
  const [onlyChild] = Children.toArray(children)
  if (!isValidElement<{ children?: ReactNode; className?: string }>(onlyChild)) return null
  if (readCodeLanguage(onlyChild.props.className) !== 'tasks') return null

  return normalizeFenceBody(readReactText(onlyChild.props.children))
}

function resolveWikilinkTarget(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null
  return target.closest<HTMLElement>('[data-wikilink-target]')?.dataset.wikilinkTarget ?? null
}

function consumeLinkEvent(event: Pick<MouseEvent, 'preventDefault' | 'stopPropagation'>) {
  event.preventDefault()
  event.stopPropagation()
}

function scheduleAfterNativeClick(callback: () => void) {
  if (typeof queueMicrotask === 'function') queueMicrotask(callback)
  else window.setTimeout(callback, 0)
}

export const MarkdownContent = memo(function MarkdownContent({ content, onWikilinkClick, renderTaskBlocks = false }: MarkdownContentProps) {
  const processedContent = useMemo(
    () => preprocessInlineTags(onWikilinkClick ? preprocessWikilinks(content) : content),
    [content, onWikilinkClick],
  )

  const handleMouseDownCapture = useCallback((event: MouseEvent) => {
    if (!resolveWikilinkTarget(event.target)) return
    consumeLinkEvent(event)
  }, [])

  const handleClickCapture = useCallback((event: MouseEvent) => {
    const target = resolveWikilinkTarget(event.target)
    if (!target) return

    consumeLinkEvent(event)
    scheduleAfterNativeClick(() => onWikilinkClick?.(target))
  }, [onWikilinkClick])

  const components = useMemo<Components>(() => {
    const nextComponents: Components = {}

    nextComponents.a = ({ href, children }: { href?: string; children?: ReactNode }) => {
      if (href?.startsWith(INLINE_TAG_SCHEME)) {
        const tag = decodeURIComponent(href.slice(INLINE_TAG_SCHEME.length))
        const style = getTagStyle(tag)
        return (
          <span
            className="inline-tag-highlight"
            data-inline-tag={tag}
            style={{
              '--inline-tag-bg': style.bg,
              '--inline-tag-color': style.color,
            } as CSSProperties}
          >
            {children}
          </span>
        )
      }

      if (href?.startsWith(WIKILINK_SCHEME)) {
        const target = decodeURIComponent(href.slice(WIKILINK_SCHEME.length))
        if (onWikilinkClick) {
          return (
            <span className="chat-wikilink" data-wikilink-target={target} role="link" tabIndex={0}>
              {children}
            </span>
          )
        }
      }

      return <a href={href}>{children}</a>
    }

    if (renderTaskBlocks) {
      nextComponents.pre = ({ children, ...props }) => {
        const query = readTasksQuery(children)
        if (query !== null) return <TasksQueryBlock query={query} />
        return <pre {...props}>{children}</pre>
      }
    }

    return nextComponents
  }, [onWikilinkClick, renderTaskBlocks])

  return (
    <div
      className="ai-markdown"
      onMouseDownCapture={onWikilinkClick ? handleMouseDownCapture : undefined}
      onClickCapture={onWikilinkClick ? handleClickCapture : undefined}
      role="presentation"
    >
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
        urlTransform={markdownUrlTransform}
      >
        {processedContent}
      </Markdown>
    </div>
  )
})

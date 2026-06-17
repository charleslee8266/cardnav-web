/**
 * 文件说明: 为当前使用的 gray-matter 包补充最小类型声明。
 */

declare module 'gray-matter' {
  export default function matter(input: string): {
    data: Record<string, unknown>;
    content: string;
  };
}

import React, { useState } from 'react';
import { Code, Copy, Check, Download, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

interface CodeSnippet {
  id: string;
  title: string;
  content: string;
  lineRange: string;
  language: string;
}

interface CodeSnippetsPanelProps {
  snippets?: CodeSnippet[];
}

export default function CodeSnippetsPanel({ snippets = [] }: CodeSnippetsPanelProps) {
  const { toast } = useToast();
  const [copiedSnippets, setCopiedSnippets] = useState<Set<string>>(new Set());

  const copyToClipboard = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedSnippets(prev => new Set(prev).add(id));
      setTimeout(() => {
        setCopiedSnippets(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 2000);
      
      toast({
        title: "Copied!",
        description: "Code snippet copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const downloadSnippet = (content: string, title: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}.cpp`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (snippets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="w-5 h-5" />
            Code Fixes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No code fixes generated yet</p>
            <p className="text-sm">Start the fixing process to see code snippets</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Code className="w-5 h-5" />
            Code Fixes ({snippets.length})
          </CardTitle>
          <Badge variant="outline">
            Ready to apply
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={snippets[0]?.id} className="w-full">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1">
            {snippets.slice(0, 4).map((snippet) => (
              <TabsTrigger key={snippet.id} value={snippet.id} className="text-xs">
                Fix {snippet.id.slice(-1)}
              </TabsTrigger>
            ))}
            {snippets.length > 4 && (
              <TabsTrigger value="more" className="text-xs">
                +{snippets.length - 4} more
              </TabsTrigger>
            )}
          </TabsList>
          
          {snippets.map((snippet) => (
            <TabsContent key={snippet.id} value={snippet.id} className="mt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="font-medium">{snippet.title}</h4>
                    <Badge variant="secondary" className="text-xs">
                      Lines {snippet.lineRange}
                    </Badge>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(snippet.content, snippet.id)}
                    >
                      {copiedSnippets.has(snippet.id) ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadSnippet(snippet.content, snippet.title)}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                
                <div className="bg-muted rounded-lg p-3 font-mono text-sm overflow-x-auto">
                  <pre className="whitespace-pre-wrap">
                    <code>{snippet.content}</code>
                  </pre>
                </div>
              </div>
            </TabsContent>
          ))}
          
          {snippets.length > 4 && (
            <TabsContent value="more" className="mt-4">
              <div className="space-y-4">
                {snippets.slice(4).map((snippet) => (
                  <div key={snippet.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="space-y-1">
                        <h4 className="font-medium">{snippet.title}</h4>
                        <Badge variant="secondary" className="text-xs">
                          Lines {snippet.lineRange}
                        </Badge>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(snippet.content, snippet.id)}
                        >
                          {copiedSnippets.has(snippet.id) ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadSnippet(snippet.content, snippet.title)}
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="bg-muted rounded-lg p-3 font-mono text-sm overflow-x-auto">
                      <pre className="whitespace-pre-wrap">
                        <code>{snippet.content}</code>
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
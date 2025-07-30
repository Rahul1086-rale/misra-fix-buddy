import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Shield, Zap, Code, Users, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import rtMisraLogo from "@/assets/rt-misra-logo.png";

export default function Index() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      
      <div className="absolute top-6 left-6 z-50">
          <img src={rtMisraLogo} alt="RT MISRA Copilot" className="h-12" />
        </div>
      
      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent mb-8 py-2">
            RT MISRA Copilot
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            AI-powered MISRA violation fixing tool using AI LLM's. Upload your code, analyze violations, and get intelligent fixes automatically.
          </p>
          <Link to="/chat">
            <Button size="lg" className="text-lg px-8 py-3">
              Start Fixing Code <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16"
        >
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <Shield className="h-10 w-10 text-primary mb-4" />
              <CardTitle>MISRA Compliance</CardTitle>
              <CardDescription>
                Automatically detect and fix MISRA violations using advanced AI analysis
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <Zap className="h-10 w-10 text-primary mb-4" />
              <CardTitle>AI Powered</CardTitle>
              <CardDescription>
                Powered by AI for intelligent code analysis and fixing
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <Code className="h-10 w-10 text-primary mb-4" />
              <CardTitle>Smart Fixes</CardTitle>
              <CardDescription>
                Get context-aware code fixes that preserve functionality while ensuring compliance
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <MessageSquare className="h-10 w-10 text-primary mb-4" />
              <CardTitle>Interactive Chat</CardTitle>
              <CardDescription>
                ChatGPT-like interface for iterative code fixing and violation analysis
              </CardDescription>
            </CardHeader>
          </Card>
        </motion.div>

        {/* How it Works */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl font-bold mb-8">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-4">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-lg mx-auto">
                1
              </div>
              <h3 className="text-xl font-semibold">Upload Files</h3>
              <p className="text-muted-foreground">
                Upload your source file and Excel MISRA violation report
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-lg mx-auto">
                2
              </div>
              <h3 className="text-xl font-semibold">Select Violations</h3>
              <p className="text-muted-foreground">
                Choose which MISRA violations you want to fix from the parsed list
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-lg mx-auto">
                3
              </div>
              <h3 className="text-xl font-semibold">Get AI Fixes</h3>
              <p className="text-muted-foreground">
                Receive intelligent code fixes from AI and apply them to your code
              </p>
            </div>
          </div>
        </motion.div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-center"
        >
          <Card className="bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4">Ready to Fix Your MISRA Violations?</h3>
              <p className="text-muted-foreground mb-6">
                Start using the AI-powered RT MISRA Copilot to make your code compliant and safer.
              </p>
              <Link to="/chat">
                <Button size="lg">
                  Launch RT MISRA Copilot <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
